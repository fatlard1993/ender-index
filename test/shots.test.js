import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { imageType, issueOf, recordOf, shotFrom } from '../src/shot';
import { publishShots } from '../src/shots';
import { handle } from '../worker/index';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const ENV = {
	QUEUE: 'me/shots',
	ORIGINS: 'https://example.invalid',
	GITHUB_TOKEN: 'token',
	TURNSTILE_SECRET: 'secret',
};

const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

/** A stand-in for GitHub and Turnstile that answers each request by its method and path, and keeps what was asked. */
const fake = (answers = {}) => {
	const asked = [];
	const fetcher = async (url, init = {}) => {
		const { pathname, search } = new URL(url);
		const key = `${init.method ?? 'GET'} ${pathname}${search}`;

		asked.push({ key, body: init.body });

		const found = Object.entries(answers).find(([pattern]) => key.startsWith(pattern))?.[1];

		return typeof found === 'function' ? found(init) : (found ?? json({}));
	};

	return { asked, fetcher };
};

const send = (fields, { origin = 'https://example.invalid', image = PNG } = {}) => {
	const form = new FormData();

	if (image) form.append('image', new File([image], 'shot.png'));
	form.append('cf-turnstile-response', 'passed');
	for (const [name, value] of Object.entries(fields)) for (const each of [value].flat()) form.append(name, each);

	return new Request('https://worker.invalid/shots', { method: 'POST', body: form, headers: { origin } });
};

describe('a shot', () => {
	test('is a PNG, JPEG or WebP by its bytes, whatever it is named', () => {
		expect(imageType(PNG)).toBe('png');
		expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
		expect(imageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
		expect(imageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeUndefined();
	});

	test('needs a story and the mods it shows, each as the site names one', () => {
		expect(shotFrom({ story: ' ', mods: ['github:a/b'] }).problem).toContain('story');
		expect(shotFrom({ story: 'x', mods: [] }).problem).toContain('names the mods');
		expect(shotFrom({ story: 'x', mods: ['github:a/b c'] }).problem).toContain('not a mod');
		expect(shotFrom({ story: 'x'.repeat(1501), mods: ['github:a/b'] }).problem).toContain('1500');
		expect(shotFrom({ story: 'x', name: 'Ste\n\nve ', mods: ['github:a/b'] }).shot.name).toBe('Ste ve');
		expect(shotFrom({ story: ' It flew. ', name: '', mods: ['github:a/b', 'github:a/b'] })).toEqual({
			shot: { story: 'It flew.', mods: ['github:a/b'] },
		});
	});

	test("waits in an issue whose record reads back as what was sent, and a reviewer's edit to it is what publishes", () => {
		const shot = { id: '1', image: '1.png', story: 'It flew.\nThen it fell.', mods: ['github:a/boats'] };
		const issue = issueOf(shot, 'https://example.invalid/1.png');

		expect(issue.title).toBe('A shot of a/boats');
		expect(issue.body).toContain('> It flew.\n> Then it fell.');
		expect(issue.body).toContain('a player who left no name, of [github:a/boats](https://github.com/a/boats)');
		expect(recordOf(issue.body)).toEqual(shot);
		expect(recordOf(issue.body.replace('"It flew.', '"It soared.')).story).toStartWith('It soared.');
		expect(recordOf('no record')).toBeUndefined();

		const forged = { ...shot, story: '```json\n{"id":"2","image":"elsewhere.png"}\n```' };

		expect(recordOf(issueOf(forged, '').body)).toEqual(forged);
	});
});

describe('the shots worker', () => {
	test('takes shots only from the index, and only from a person', async () => {
		const passing = fake({ 'POST /turnstile': json({ success: true }) }).fetcher;
		const failing = fake({ 'POST /turnstile': json({ success: false }) }).fetcher;

		expect(
			(await handle(send({ story: 'x', mods: 'github:a/b' }, { origin: 'https://elsewhere.invalid' }), ENV, passing))
				.status,
		).toBe(403);
		expect((await handle(send({ story: 'x', mods: 'github:a/b' }), ENV, failing)).status).toBe(403);
		expect((await handle(new Request('https://worker.invalid/other'), ENV, passing)).status).toBe(404);
	});

	test('turns away what is not a picture, and says why', async () => {
		const { fetcher } = fake({ 'POST /turnstile': json({ success: true }) });
		const response = await handle(
			send({ story: 'x', mods: 'github:a/b' }, { image: new TextEncoder().encode('<svg/>') }),
			ENV,
			fetcher,
		);

		expect(response.status).toBe(415);
		expect((await response.json()).problem).toContain('PNG');
	});

	test('files a shot as a branch holding its picture and an issue, and tells the sender neither', async () => {
		const { asked, fetcher } = fake({
			'POST /turnstile': json({ success: true }),
			'GET /repos/me/shots/git/ref/heads/main': json({ object: { sha: 'abc' } }),
		});
		const response = await handle(send({ story: 'It flew.', name: 'Steve', mods: ['github:a/boats'] }), ENV, fetcher);

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ queued: true });

		const [, , branch, file, issue] = asked;
		const id = JSON.parse(branch.body).ref.replace('refs/heads/shot/', '');

		expect(file.key).toBe(`PUT /repos/me/shots/contents/${id}.png`);
		expect(JSON.parse(file.body)).toMatchObject({ branch: `shot/${id}`, content: btoa(String.fromCharCode(...PNG)) });
		expect(recordOf(JSON.parse(issue.body).body)).toMatchObject({
			id,
			image: `${id}.png`,
			name: 'Steve',
			mods: ['github:a/boats'],
		});
	});

	test('says when GitHub would not take the shot, rather than claiming it was filed', async () => {
		const { fetcher } = fake({
			'POST /turnstile': json({ success: true }),
			'GET /repos/me/shots/git/ref': () => new Response('', { status: 401 }),
		});
		const response = await handle(send({ story: 'x', mods: 'github:a/b' }), ENV, fetcher);

		expect(response.status).toBe(502);
	});
});

describe('publishing shots', () => {
	const issue = (number, state, labels, id, at) => ({
		number,
		state,
		labels: labels.map(name => ({ name })),
		body: issueOf({ id, image: `${id}.png`, story: `story ${id}`, mods: ['github:a/boats'], at }, '', '').body,
	});

	test('publishes the shown, deletes every branch decided on, closes what it published, and keeps the queue open', async () => {
		const data = await mkdtemp(join(tmpdir(), 'shots-'));
		const { asked, fetcher } = fake({
			'GET /repos/me/shots/issues': json([
				issue(1, 'open', ['shown'], 'old', '2026-01-01'),
				issue(2, 'open', ['shown'], 'new', '2026-02-01'),
				issue(3, 'closed', [], 'refused'),
				issue(4, 'open', [], 'waiting'),
				{ number: 5, state: 'open', labels: [], body: 'hand-written' },
			]),
			'GET /repos/me/shots/contents/': () => new Response(PNG),
			'DELETE /repos/me/shots/git/refs/heads/shot/refused': () => new Response('', { status: 404 }),
		});
		const logged = [];

		try {
			await Bun.write(join(data, 'shots', 'unlabelled.png'), PNG);

			const byMod = await publishShots({
				queue: 'me/shots',
				token: 't',
				data,
				fetcher,
				log: line => logged.push(line),
			});

			expect(byMod['github:a/boats'].map(shot => shot.id)).toEqual(['new', 'old']);
			expect((await readdir(join(data, 'shots'))).toSorted()).toEqual(['new.png', 'old.png']);
			expect(asked.map(({ key }) => key)).toEqual(
				expect.arrayContaining([
					'DELETE /repos/me/shots/git/refs/heads/shot/refused',
					'PATCH /repos/me/shots/issues/1',
					'PATCH /repos/me/shots/issues/2',
				]),
			);
			expect(asked.some(({ key }) => key.includes('waiting'))).toBe(false);
			expect(logged).toContain('Shot issue #5 has no record that reads; it is left out');
			expect(logged).toContain('Unpublished unlabelled.png, whose issue is no longer labelled shown');
		} finally {
			await rm(data, { recursive: true });
		}
	});
});

describe('sharing from the site', () => {
	test('opens with the mods chosen and those an instance offers, each by key or by id', async () => {
		const { askedFor, sharePath } = await import('../client/shots');

		expect(sharePath(['github:a/boats'])).toBe('?mod=github%3Aa%2Fboats#/share');
		expect(askedFor('?mod=github:a/boats&mod=sodium&from=gitlab:group/sub/mod&from=lithium&from=')).toEqual({
			chosen: { keys: ['github:a/boats'], ids: ['sodium'] },
			offered: { keys: ['gitlab:group/sub/mod'], ids: ['lithium'] },
		});
	});

	test('sends a picture scaled down to fit, never up', async () => {
		const { SHOT_WIDEST, fitWithin } = await import('../client/shots');

		expect(fitWithin(3840, 2160)).toEqual({ width: SHOT_WIDEST, height: 1080 });
		expect(fitWithin(1080, 2400)).toEqual({ width: 864, height: SHOT_WIDEST });
		expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
	});
});
