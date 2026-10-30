import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';

import {
	DATA,
	crawlEach,
	crawlOrder,
	parseLine,
	pictureFiles,
	recordPath,
	spendingLine,
	waitForReset,
	writeJsonLines,
} from '../src/crawl';
import { RateLimited } from '../src/fetch';
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
		const directory = await mkdtemp(join(tmpdir(), 'ender-download-'));
		const path = join(directory, 'oversized.jar');

		try {
			await expect(download(`http://localhost:${server.port}/big.jar`, path, { limit })).rejects.toThrow(
				`past the ${limit} byte limit`,
			);
		} finally {
			server.stop();
			await rm(directory, { recursive: true, force: true });
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

describe('a readme', () => {
	const answering = (body, status = 200) => {
		const original = globalThis.fetch;
		const token = process.env.GITHUB_TOKEN;

		globalThis.fetch = async () => Response.json(body, { status });
		process.env.GITHUB_TOKEN = 'test';

		return () => {
			globalThis.fetch = original;
			process.env.GITHUB_TOKEN = token;
			if (token === undefined) delete process.env.GITHUB_TOKEN;
		};
	};

	test('is the one GitHub shows, or none when it answers 404', async () => {
		const { readme } = await import('../src/github');
		let restore = answering({ path: 'docs/README.md' });

		try {
			expect(await readme('a/b')).toBe('docs/README.md');
		} finally {
			restore();
		}

		restore = answering({ message: 'Not Found' }, 404);

		try {
			expect(await readme('a/b')).toBeNull();
		} finally {
			restore();
		}
	});

	test('is the readme file at the root on Codeberg', async () => {
		const restore = answering([
			{ type: 'dir', name: 'readme', path: 'readme' },
			{ type: 'file', name: 'README.md', path: 'README.md' },
		]);

		try {
			expect(await (await import('../src/codeberg')).readme('a/b')).toBe('README.md');
		} finally {
			restore();
		}
	});

	test('is named by the page GitLab gives for it', async () => {
		const { readmePath } = await import('../src/gitlab');

		expect(readmePath('https://gitlab.com/g/p/-/blob/main/docs/Read%20Me.md')).toBe('docs/Read Me.md');
		expect(readmePath(null)).toBeNull();
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

	test('waits as long as a 429 asks when that is short, a minute when it does not say, and gives back one that asks for longer', async () => {
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

			const unsaid = serving([429, 429]);

			try {
				expect((await fetchSteady(unsaid.url, undefined, { pauses: [0, 0], unsaid: 0 })).status).toBe(200);
				expect(unsaid.asked()).toBe(3);
			} finally {
				unsaid.server.stop();
			}
		} finally {
			soon.server.stop();
			later.server.stop();
			reset.server.stop();
		}
	});
});

describe('the rate limit', () => {
	test("a host's 429 that asks for longer than a short wait is its rate limit, lifting when it says", async () => {
		const { limitedBy, RateLimited } = await import('../src/fetch');
		const now = Date.now();
		const limited = limitedBy('GitLab', new Response(null, { status: 429, headers: { 'retry-after': '600' } }));
		const unsaid = limitedBy('Codeberg', new Response(null, { status: 429 }));

		expect(limited).toBeInstanceOf(RateLimited);
		expect(limited.resetAt - now).toBeWithin(600_000, 601_000);
		expect(limited.message).toStartWith('GitLab asks to be left alone until ');
		expect(unsaid.resetAt - now).toBeWithin(60_000, 61_000);
	});

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
		expect(kindOf('/repos/a/b/readme')).toBe('readmes');

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

describe("one host's rate limit", () => {
	afterEach(() => setSystemTime());

	const limitedOnce = (host, resetIn) => {
		const asked = [];
		let limited = false;

		return {
			asked,
			crawlRepo: async line => {
				asked.push(line);

				if (line.startsWith(`${host}:`) && !limited) {
					limited = true;

					throw new RateLimited(`${host} asks to be left alone`, Date.now() + resetIn);
				}
			},
		};
	};
	const sleep = async wait => setSystemTime(new Date(Date.now() + wait));

	test("holds back no other host's repositories, and crawls its own when it lifts", async () => {
		setSystemTime(new Date('2026-10-27T10:00:00Z'));

		const { asked, crawlRepo } = limitedOnce('gitlab', 60_000);
		const outcome = await crawlEach(['gitlab:a/x', 'gitlab:a/y', 'b/z'], {
			crawlRepo,
			sleep,
			deadline: Date.now() + 3_600_000,
		});

		expect(asked).toEqual(['gitlab:a/x', 'b/z', 'gitlab:a/x', 'gitlab:a/y']);
		expect(outcome).toEqual({ failures: [], stopped: [] });
	});

	test('crawled several at once, sets the limited host aside for every one of them, and crawls each repository once', async () => {
		setSystemTime(new Date('2026-10-27T10:00:00Z'));

		const { asked, crawlRepo } = limitedOnce('gitlab', 60_000);
		const lines = ['gitlab:a/x', 'gitlab:a/y', ...Array.from({ length: 10 }, (_, at) => `b/${at}`)];
		const outcome = await crawlEach(lines, { crawlRepo, sleep, parallel: 4, deadline: Date.now() + 3_600_000 });

		expect(outcome).toEqual({ failures: [], stopped: [] });
		expect(asked.filter(line => line === 'gitlab:a/x')).toHaveLength(2);
		expect(new Set(asked)).toEqual(new Set(lines));
		expect(asked.length).toBe(lines.length + 1);
	});

	test('past the time budget, leaves its repositories for the next crawl and says how many', async () => {
		setSystemTime(new Date('2026-10-27T10:00:00Z'));

		const { asked, crawlRepo } = limitedOnce('gitlab', 3_600_000);
		const outcome = await crawlEach(['gitlab:a/x', 'gitlab:a/y', 'b/z'], {
			crawlRepo,
			sleep,
			deadline: Date.now() + 60_000,
		});

		expect(asked).toEqual(['gitlab:a/x', 'b/z']);
		expect(outcome.stopped).toEqual([
			"gitlab asks to be left alone, past the time budget; 2 of GitLab's repositories are crawled first next time",
		]);
	});
});

test("a gist pack is crawled under GitHub's rate limit", async () => {
	const asked = [];
	const outcome = await crawlEach(['gist:abc123', 'a/b'], {
		crawlRepo: async line => {
			asked.push(line);
		},
		deadline: Date.now() + 60_000,
	});

	expect(asked).toEqual(['gist:abc123', 'a/b']);
	expect(outcome).toEqual({ failures: [], stopped: [] });
});

describe('a crawl held up', () => {
	test('sets a repository aside that takes past its limit, and goes on to the rest', async () => {
		setSystemTime();

		const asked = [];
		const outcome = await crawlEach(['a/stalls', 'b/fine'], {
			crawlRepo: async line => {
				asked.push(line);

				if (line === 'a/stalls') await new Promise(() => {});
			},
			deadline: Date.now() + 60_000,
			repoLimit: 50,
		});

		expect(asked).toEqual(['a/stalls', 'b/fine']);
		expect(outcome.failures).toEqual([]);
		expect(outcome.stopped).toEqual([
			`Set aside a/stalls: it took longer than ${50 / 60_000} minutes, and is left for a later crawl`,
		]);
	});

	test('a request that never answers is given up on at its limit and asked again', async () => {
		const { fetchSteady } = await import('../src/fetch');
		let asked = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () => {
				asked++;

				return new Promise(() => {});
			},
		});

		try {
			await expect(
				fetchSteady(`http://localhost:${server.port}/`, undefined, { pauses: [0], limit: 100 }),
			).rejects.toThrow('took longer than 0.1s');
			expect(asked).toBe(2);
		} finally {
			server.stop(true);
		}
	});
});

describe('the order a crawl takes repositories in', () => {
	test('what packs use and the index has never read comes first, the most used first', () => {
		const ages = { 'a/old': 10, 'a/read': 5, 'm/used': 0, 'a/used': 0 };
		const demand = new Map([
			['m/used', 3],
			['a/used', 1],
			['a/read', 9],
		]);

		expect(crawlOrder(['a/old', 'a/read', 'a/used'], ['m/used'], line => ages[line], demand)).toEqual([
			'm/used',
			'a/used',
			'a/read',
			'a/old',
		]);
	});

	test('takes lines differing only in case as one repository, as its host does', () => {
		expect(crawlOrder(['A/Mod', 'a/mod', 'b/x'], ['b/X', 'c/y', 'C/Y'], () => 0)).toEqual(['A/Mod', 'b/x', 'c/y']);
	});

	test("every one found on its host before any known only from Modrinth, however new Modrinth's are", () => {
		const ages = { 'a/old': 10, 'a/older': 5, 'm/new': 0, 'm/never': 0, 'a/both': 20 };

		expect(crawlOrder(['a/old', 'a/both', 'a/older'], ['m/new', 'a/both', 'm/never'], line => ages[line])).toEqual([
			'a/older',
			'a/old',
			'a/both',
			'm/new',
			'm/never',
		]);
	});
});

describe('the search file', () => {
	test('reads back as it was written, an entry to a line', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'ender-lines-'));
		const path = join(directory, 'search.json');
		const entries = [
			{ repo: 'a/b', tags: ['ship'] },
			{ repo: 'c/d', description: 'Line\nbreak' },
		];

		try {
			await writeJsonLines(path, entries);

			expect(await Bun.file(path).json()).toEqual(entries);
			expect((await Bun.file(path).text()).split('\n')).toHaveLength(entries.length + 3);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});

describe("a repository's pictures", () => {
	test('are its images outside its sources and builds, and not its icon or logo', () => {
		expect(
			pictureFiles([
				'screenshots/sailing.png',
				'docs/img/helm.jpg',
				'.github/images/demo.gif',
				'banner.png',
				'src/main/resources/assets/boats/textures/item/helm.png',
				'src/main/resources/assets/boats/icon.png',
				'build/tmp/x.png',
				'logo.webp',
				'README.md',
			]),
		).toEqual(['screenshots/sailing.png', 'docs/img/helm.jpg', '.github/images/demo.gif']);
	});
});

describe("a personal token's allowance", () => {
	test("is not spent past the reserve kept for its owner, which waits for the hour's reset", async () => {
		const original = globalThis.fetch;
		const token = process.env.GITHUB_TOKEN;
		const resetAt = Math.floor(Date.now() / 1000) + 600;
		let asked = 0;

		globalThis.fetch = async () => {
			++asked;

			return Response.json(
				{ full_name: 'a/b' },
				{
					headers: {
						'x-ratelimit-remaining': '900',
						'x-ratelimit-reset': String(resetAt),
						'x-ratelimit-resource': 'core',
					},
				},
			);
		};
		process.env.GITHUB_TOKEN = 'test';
		process.env.CRAWL_RESERVE = '1000';

		try {
			const github = await import('../src/github');

			await github.request('/repos/a/b');

			const refused = await github.request('/repos/a/c').catch(error => error);

			expect(refused).toBeInstanceOf((await import('../src/fetch')).RateLimited);
			expect(refused.resetAt).toBe(resetAt * 1000);
			expect(asked).toBe(1);
		} finally {
			globalThis.fetch = original;
			process.env.GITHUB_TOKEN = token;
			if (token === undefined) delete process.env.GITHUB_TOKEN;
			delete process.env.CRAWL_RESERVE;
		}
	});
});
