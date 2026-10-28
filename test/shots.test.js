import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { shareUrl } from '../client/shots';
import { fieldsOf, modNamed, shotOf } from '../src/shot';
import { publishShots, shrink } from '../src/shots';

const PICTURE = 'https://github.com/user-attachments/assets/0f0e1d2c-3b4a-5968-7766-554433221100';

const entry = (repo, mods, stars = 0, host = 'github') => ({
	repo,
	host,
	stars,
	latest: { mods: mods.map(([id, name]) => ({ id, name })) },
});

const LISTING = [
	entry('fatlard1993/big-boats', [['bigboats', 'Big Boats']], 3),
	entry('CaffeineMC/lithium', [['lithium', 'Lithium']], 2000),
	entry('someone/boats-fork', [['big_boats_fork', 'Big Boats']], 1),
	entry('group/sub/mod', [['submod', 'Sub Mod']], 1, 'gitlab'),
];

/** An issue as GitHub files the form: each answer under its label as a heading. */
const filed = ({ mods = 'Big Boats', picture = `<img alt="shot" src="${PICTURE}" />`, story = 'It flew.' } = {}) =>
	`### Mods it shows\n\n${mods}\n\n### Picture\n\n${picture}\n\n### Story\n\n${story}`;

const issue = (number, labels, body = filed(), state = 'open') => ({
	number,
	state,
	labels: labels.map(name => ({ name })),
	body,
	user: { login: `player${number}` },
	created_at: `2026-10-${String(number).padStart(2, '0')}T00:00:00Z`,
	html_url: `https://github.com/me/index/issues/${number}`,
});

const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

/** GitHub as the publishing step meets it, answering by method and path, and keeping what was asked. */
const fake = (issues, pictures = {}) => {
	const asked = [];
	const fetcher = async (url, init = {}) => {
		asked.push({
			key: `${init.method ?? 'GET'} ${url.replace('https://api.github.com/repos/me/index', '')}`,
			body: init.body,
		});

		if (url.includes('/issues?labels=shot')) return json(issues);
		if (url.startsWith('https://github.com/user-attachments/')) return pictures[url] ?? new Response('picture');

		return json({});
	};

	return { asked, fetcher };
};

const publishing = async (issues, run, options = {}) => {
	const data = await mkdtemp(join(tmpdir(), 'shots-'));
	const logged = [];
	const { asked, fetcher } = fake(issues, options.pictures);
	const publish = () =>
		publishShots({
			repository: 'me/index',
			token: 't',
			data,
			listing: LISTING,
			labelled: options.labelled,
			fetcher,
			shrinkPicture: async bytes => bytes,
			log: line => logged.push(line),
		});

	try {
		await run({ publish, data, asked, logged });
	} finally {
		await rm(data, { recursive: true });
	}
};

describe('a shot', () => {
	test("is read from the form's answers, with an answer left empty read as nothing", () => {
		expect(fieldsOf(filed({ story: '_No response_' }))).toEqual({
			'Mods it shows': 'Big Boats',
			Picture: `<img alt="shot" src="${PICTURE}" />`,
			Story: '',
		});
	});

	test('names its mods however a player would: key, spec, link, id or name', () => {
		expect(modNamed('github:fatlard1993/big-boats', LISTING)).toBe('github:fatlard1993/big-boats');
		expect(modNamed('gh:CaffeineMC/lithium', LISTING)).toBe('github:CaffeineMC/lithium');
		expect(modNamed('https://github.com/CaffeineMC/lithium/releases', LISTING)).toBe('github:CaffeineMC/lithium');
		expect(modNamed('https://gitlab.com/group/sub/mod/-/tree/main', LISTING)).toBe('gitlab:group/sub/mod');
		expect(modNamed('https://fatlard1993.github.io/ender-index/#/mod/github/fatlard1993/big-boats', LISTING)).toBe(
			'github:fatlard1993/big-boats',
		);
		expect(modNamed('- lithium', LISTING)).toBe('github:CaffeineMC/lithium');
		expect(modNamed('big boats', LISTING)).toBe('github:fatlard1993/big-boats');
		expect(modNamed('Sodium', LISTING)).toBeUndefined();
	});

	test('takes its picture only from where GitHub keeps what was dragged in, and says what does not read', () => {
		const { shot, picture, problems } = shotOf(
			issue(7, ['shot'], filed({ mods: 'Lithium\nSodium', picture: '![x](https://example.invalid/x.png)' })),
			LISTING,
		);

		expect(shot).toMatchObject({ id: 7, by: 'player7', mods: ['github:CaffeineMC/lithium'], story: 'It flew.' });
		expect(picture).toBeUndefined();
		expect(problems).toEqual(['Sodium is not a mod the index lists', 'It has no picture dragged or pasted in']);
	});

	test('is shared with the form, the mods it shows filled in', () => {
		const url = new URL(shareUrl(['github:a/boats', 'lithium']));

		expect(url.pathname).toEndWith('/issues/new');
		expect(url.searchParams.get('template')).toBe('shot.yml');
		expect(url.searchParams.get('mods')).toBe('github:a/boats\nlithium');
	});
});

describe('publishing shots', () => {
	test('publishes the shown, newest first, and closes their issues; leaves the rest waiting', () =>
		publishing(
			[issue(1, ['shot', 'shown']), issue(2, ['shot', 'shown'], filed(), 'closed'), issue(3, ['shot'])],
			async ({ publish, data, asked }) => {
				const byMod = await publish();

				expect(byMod['github:fatlard1993/big-boats'].map(shot => shot.id)).toEqual([2, 1]);
				expect(byMod['github:fatlard1993/big-boats'][0]).toMatchObject({ image: 'shots/2.webp', by: 'player2' });
				expect((await readdir(join(data, 'shots'))).toSorted()).toEqual(['1.webp', '2.webp']);
				expect(asked.filter(({ key }) => key.startsWith('PATCH')).map(({ key }) => key)).toEqual(['PATCH /issues/1']);
			},
		));

	test('keeps a published shot as it was, whatever its author edits later, and unpublishes it when the label comes off', async () => {
		let issues = [issue(1, ['shot', 'shown'])];
		const data = await mkdtemp(join(tmpdir(), 'shots-'));
		const run = () =>
			publishShots({
				repository: 'me/index',
				token: 't',
				data,
				listing: LISTING,
				fetcher: fake(issues).fetcher,
				shrinkPicture: async bytes => bytes,
				log: () => {},
			});

		try {
			await run();
			issues = [issue(1, ['shot', 'shown'], filed({ story: 'Buy cheap gold' }))];
			expect((await run())['github:fatlard1993/big-boats'][0].story).toBe('It flew.');

			issues = [issue(1, ['shot'], filed({ story: 'Buy cheap gold' }))];
			expect(await run()).toEqual({});
			expect(await readdir(join(data, 'shots'))).toEqual([]);
		} finally {
			await rm(data, { recursive: true });
		}
	});

	test('tells the issue just labelled what kept it from showing, and only that one', () =>
		publishing(
			[issue(4, ['shot', 'shown'], filed({ mods: 'Sodium' })), issue(5, ['shot', 'shown'], filed({ picture: 'none' }))],
			async ({ publish, asked, logged }) => {
				expect(await publish()).toEqual({});

				const comments = asked.filter(({ key }) => key.endsWith('/comments'));

				expect(comments.map(({ key }) => key)).toEqual(['POST /issues/4/comments']);
				expect(JSON.parse(comments[0].body).body).toContain('- Sodium is not a mod the index lists');
				expect(logged.some(line => line.startsWith('Shot #5: It has no picture'))).toBe(true);
			},
			{ labelled: 4 },
		));

	test('says when a picture does not download, rather than showing a shot without one', () =>
		publishing(
			[issue(6, ['shot', 'shown'])],
			async ({ publish, logged }) => {
				expect(await publish()).toEqual({});
				expect(logged).toContain('Shot #6: Its picture did not download: GitHub answered 404');
			},
			{ pictures: { [PICTURE]: new Response('', { status: 404 }) } },
		));
});

describe("a shot's picture", () => {
	test('is kept as WebP at most 1920 on its longest side, and a small one is not enlarged', async () => {
		const { default: sharp } = await import('sharp');
		const png = (width, height) =>
			sharp({ create: { width, height, channels: 3, background: '#336' } })
				.png()
				.toBuffer();

		expect(await sharp(await shrink(await png(3840, 2160))).metadata()).toMatchObject({
			format: 'webp',
			width: 1920,
			height: 1080,
		});
		expect(await sharp(await shrink(await png(800, 600))).metadata()).toMatchObject({ width: 800, height: 600 });
		await expect(shrink(new TextEncoder().encode('<svg/>'))).rejects.toThrow();
	});
});
