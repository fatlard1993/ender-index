import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { DATA, parseLine, recordPath, spendingLine, waitForReset } from '../src/crawl';
import { kindOf } from '../src/github';
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
	const serving = (statuses, headers) => {
		let asked = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () => new Response('ok', { status: statuses[asked++] ?? 200, headers }),
		});

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

	test('waits as long as a 429 asks when that is short, and gives back one that asks for longer', async () => {
		const { fetchSteady } = await import('../src/fetch');
		const soon = serving([429, 429], { 'retry-after': '0' });
		const later = serving([429], { 'retry-after': '3600' });
		const reset = serving([429], { 'ratelimit-reset': String(Math.floor(Date.now() / 1000)) });

		try {
			expect((await fetchSteady(soon.url, undefined, { pauses: [0, 0] })).status).toBe(200);
			expect(soon.asked()).toBe(3);
			expect((await fetchSteady(later.url, undefined, { pauses: [0, 0] })).status).toBe(429);
			expect(later.asked()).toBe(1);
			expect((await fetchSteady(reset.url, undefined, { pauses: [0, 0] })).status).toBe(200);
			expect(reset.asked()).toBe(2);
		} finally {
			soon.server.stop();
			later.server.stop();
			reset.server.stop();
		}
	});
});

describe('the rate limit', () => {
	test('is waited out when it resets inside the time budget, and stops the crawl when it does not', () => {
		const now = 1_000_000;

		expect(waitForReset(now + 60_000, now + 3_600_000, now)).toBe(65_000);
		expect(waitForReset(now - 60_000, now + 3_600_000, now)).toBe(0);
		expect(waitForReset(now + 3_600_000, now + 60_000, now)).toBeUndefined();
	});

	test('is reported by what spent it, since only requests answered in full count', () => {
		expect(kindOf('/repos/a/b')).toBe('repository');
		expect(kindOf('/repos/a/b/releases?per_page=30')).toBe('releases');
		expect(kindOf('/repos/a/b/releases?per_page=30&page=3')).toBe('history pages');
		expect(kindOf('/search/code?q=x')).toBe('code search');

		expect(
			spendingLine({
				full: { releases: 120, repository: 1480 },
				unchanged: 6200,
				remaining: 0,
				resetAt: Date.parse('2026-10-25T20:00:00Z'),
			}),
		).toBe(
			'GitHub answered 1,600 requests in full (repository 1,480, releases 120) and 6,200 unchanged, which the rate limit does not count; 0 left until 2026-10-25T20:00:00.000Z',
		);
		expect(spendingLine({ full: {}, unchanged: 0 })).toBe(
			'GitHub answered 0 requests in full and 0 unchanged, which the rate limit does not count',
		);
	});
});
