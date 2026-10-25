import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { DATA, parseLine, recordPath } from '../src/crawl';
import { assetOf } from '../src/gitlab';

describe('repositories on other hosts', () => {
	test('a line names its host, and a bare owner/repo is GitHub', () => {
		expect(parseLine('CaffeineMC/lithium')).toEqual({ host: 'github', name: 'CaffeineMC/lithium' });
		expect(parseLine('codeberg:enjarai/do-a-barrel-roll')).toEqual({
			host: 'codeberg',
			name: 'enjarai/do-a-barrel-roll',
		});
		expect(parseLine('gitlab:group/sub/project')).toEqual({ host: 'gitlab', name: 'group/sub/project' });
		expect(() => parseLine('sourcehut:a/b')).toThrow('Unknown host "sourcehut"');
	});

	test("each host's records live apart, where no GitHub owner can collide", () => {
		expect(recordPath({ host: 'github', name: 'a/b' })).toBe(join(DATA, 'mods', 'a/b.json'));
		expect(recordPath({ host: 'codeberg', name: 'a/b' })).toBe(join(DATA, 'mods', 'codeberg.org', 'a/b.json'));
		expect(recordPath({ host: 'gitlab', name: 'g/s/p' })).toBe(join(DATA, 'mods', 'gitlab.com', 'g/s/p.json'));
	});

	// GitLab names a link for display; the file it leads to is what says whether it is a jar.
	test('a GitLab release link is named by the file it leads to', () => {
		expect(
			assetOf({
				id: 1,
				name: 'Mod jar',
				url: 'https://x.invalid/a',
				direct_asset_url: 'https://cdn.example/v/autokey-1.1.2%2B1.20.6.jar',
			}),
		).toEqual({
			id: 1,
			name: 'autokey-1.1.2+1.20.6.jar',
			browser_download_url: 'https://cdn.example/v/autokey-1.1.2%2B1.20.6.jar',
		});
		expect(assetOf({ id: 2, name: 'Modrinth', url: 'https://modrinth.com/mod/x' }).name).toBe('x');
	});

	test("a link to a CI job's artifact is read from the file, not GitLab's page about it", () => {
		expect(
			assetOf({ id: 3, url: 'https://gitlab.com/g/p/-/jobs/42/artifacts/file/build/libs/mod-1.0.jar' })
				.browser_download_url,
		).toBe('https://gitlab.com/g/p/-/jobs/42/artifacts/raw/build/libs/mod-1.0.jar');
	});
});

describe('downloads', () => {
	test('stop at the limit when the host declares no size', async () => {
		const { download } = await import('../src/crawl');
		const limit = 4 * 1024 * 1024;
		const chunk = new Uint8Array(1024 * 1024);
		let sent = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () =>
				new Response(
					new ReadableStream({
						pull(controller) {
							if (sent > limit + chunk.length) return controller.close();

							sent += chunk.length;
							controller.enqueue(chunk);
						},
					}),
				),
		});
		const path = join(import.meta.dir, '..', '.cache', 'oversized.jar');

		try {
			await expect(download(`http://localhost:${server.port}/big.jar`, path, { limit })).rejects.toThrow(
				`past the ${limit} byte limit`,
			);
		} finally {
			server.stop();
			await Bun.file(path)
				.delete?.()
				.catch(() => {});
		}
	});
});

describe('the response cache', () => {
	test('is read once however many ask for it at once', async () => {
		const { CACHE, lastFetched } = await import('../src/github');
		const original = Bun.file;
		let reads = 0;

		await Bun.write(CACHE, JSON.stringify({ '/repos/a/b': { etag: 'x', fetched: 5, body: {} } }));

		Bun.file = (...args) => {
			if (args[0] === CACHE) ++reads;

			return original(...args);
		};

		try {
			const ages = await Promise.all(Array.from({ length: 50 }, () => lastFetched('/repos/a/b')));

			expect(ages.every(age => age === 5)).toBe(true);
			expect(reads).toBe(1);
		} finally {
			Bun.file = original;
		}
	});
});

describe('releases switched off', () => {
	const answering = status => {
		const original = globalThis.fetch;

		globalThis.fetch = async () => new Response('{}', { status });

		return () => (globalThis.fetch = original);
	};

	test('read as none on Codeberg, which answers 404', async () => {
		const restore = answering(404);

		try {
			expect(await (await import('../src/codeberg')).releases('a/b')).toEqual([]);
		} finally {
			restore();
		}
	});

	test('read as none on GitLab, which answers 403', async () => {
		const restore = answering(403);

		try {
			expect(await (await import('../src/gitlab')).releases('a/b')).toEqual([]);
		} finally {
			restore();
		}
	});

	test('but other failures still fail', async () => {
		const restore = answering(401);

		try {
			await expect((await import('../src/codeberg')).releases('a/b')).rejects.toThrow('Codeberg 401');
		} finally {
			restore();
		}
	});
});

describe('a request', () => {
	const serving = statuses => {
		let asked = 0;
		const server = Bun.serve({ port: 0, fetch: () => new Response('ok', { status: statuses[asked++] ?? 200 }) });

		return { server, url: `http://localhost:${server.port}/`, asked: () => asked };
	};

	test('is asked again after a server error', async () => {
		const { fetchSteady } = await import('../src/fetch');
		const { server, url, asked } = serving([502, 503]);

		try {
			expect((await fetchSteady(url, undefined, { pauses: [0, 0] })).status).toBe(200);
			expect(asked()).toBe(3);
		} finally {
			server.stop();
		}
	});

	test('gives the last server error back when it persists, and other answers at once', async () => {
		const { fetchSteady } = await import('../src/fetch');
		const failing = serving([500, 500, 500]);
		const missing = serving([404]);

		try {
			expect((await fetchSteady(failing.url, undefined, { pauses: [0, 0] })).status).toBe(500);
			expect(failing.asked()).toBe(3);
			expect((await fetchSteady(missing.url, undefined, { pauses: [0, 0] })).status).toBe(404);
			expect(missing.asked()).toBe(1);
		} finally {
			failing.server.stop();
			missing.server.stop();
		}
	});
});
