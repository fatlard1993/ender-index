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
});

describe('downloads', () => {
	test('stop at the limit when the host declares no size', async () => {
		const { download, MAX_DOWNLOAD } = await import('../src/crawl');
		const chunk = new Uint8Array(1024 * 1024);
		let sent = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () =>
				new Response(
					new ReadableStream({
						pull(controller) {
							if (sent > MAX_DOWNLOAD + chunk.length) return controller.close();

							sent += chunk.length;
							controller.enqueue(chunk);
						},
					}),
				),
		});
		const path = join(import.meta.dir, '..', '.cache', 'oversized.jar');

		try {
			await expect(download(`http://localhost:${server.port}/big.jar`, path)).rejects.toThrow('byte limit');
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
