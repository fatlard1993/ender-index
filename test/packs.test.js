import { describe, expect, test } from 'bun:test';

import { packsFrom } from '../src/discover';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RateLimited } from '../src/fetch';
import { buildPacks, describeMods, fileAt, gistPack, packDemand, packPage, zipEntryByRanges } from '../src/packs';

const entry = repo => ({ repo, host: 'github' });

const record = (repo, names) => ({ repo, host: 'github', releases: [{ assets: names.map(name => ({ name })) }] });

describe('the pack listing', () => {
	const entries = [entry('a/linked'), entry('b/named'), entry('c/filed'), entry('d/modrinth')];
	const records = [record('c/filed', ['filed-1.0.jar'])];
	const modrinthIds = { AANobbMI: 'd/modrinth', gone: 'z/not-indexed' };

	test('matches each mod by its link, its spec, its file name, and last its Modrinth project', () => {
		const [pack] = buildPacks(
			[
				{
					repo: 'p/pack',
					host: 'github',
					stars: 5,
					formats: {
						packwiz: {
							name: 'Pack',
							minecraft: '1.21.1',
							loader: 'fabric',
							mods: [
								{ file: 'x.jar', url: 'https://github.com/a/linked/releases/download/v1/x.jar' },
								{ file: 'filed-1.0.jar', url: 'https://example.invalid/filed-1.0.jar' },
								{ file: 'sodium.jar', modrinth: 'AANobbMI' },
								{ file: 'gone.jar', url: 'https://cdn.modrinth.com/data/gone/versions/1/gone.jar' },
								{ file: 'nobody.jar' },
							],
						},
					},
				},
			],
			entries,
			records,
			modrinthIds,
		);

		expect(pack).toMatchObject({
			name: 'Pack',
			count: 5,
			matched: ['github:a/linked', 'github:c/filed', 'github:d/modrinth'],
			install: 'ender import gh:p/pack',
			formats: ['packwiz'],
		});
	});

	test('says of each mod it has not got where its source and its jar are, and counts what comes from Modrinth or nowhere', () => {
		const [pack] = buildPacks(
			[
				{
					repo: 'p/pack',
					host: 'github',
					formats: {
						packwiz: {
							mods: [
								{ name: 'Sodium', file: 'sodium.jar', modrinth: 'AANobbMI' },
								{ name: 'Gone', file: 'gone.jar', modrinth: 'gone', title: 'Gone Mod', slug: 'gone-mod' },
								{ name: 'Elsewhere', file: 'e.jar', modrinth: 'el', source: 'https://git.sr.ht/~a/e' },
								{ name: 'Closed', file: 'c.jar', modrinth: 'cl' },
								{ name: 'Fresh', file: 'f.jar', url: 'https://github.com/q/fresh/releases/download/v1/f.jar' },
								{ name: 'Keyed', file: 'k.jar', curseforge: '238222' },
							],
						},
					},
				},
			],
			entries,
			records,
			modrinthIds,
		);

		expect(pack.mods).toEqual([
			{ name: 'Sodium', key: 'github:d/modrinth' },
			{
				name: 'Gone Mod',
				file: 'gone.jar',
				source: 'https://github.com/z/not-indexed',
				jar: 'modrinth',
				modrinth: 'gone-mod',
			},
			{ name: 'Elsewhere', file: 'e.jar', source: 'https://git.sr.ht/~a/e', jar: 'modrinth', modrinth: 'el' },
			{ name: 'Closed', file: 'c.jar', jar: 'modrinth', modrinth: 'cl' },
			{ name: 'Fresh', file: 'f.jar', source: 'https://github.com/q/fresh', jar: 'link' },
			{ name: 'Keyed', file: 'k.jar', jar: 'none' },
		]);
		expect(pack).toMatchObject({ count: 6, fromModrinth: 3, unsourced: 2, missing: 1 });
	});

	test("are told by Modrinth, by a mod's link or else its file's SHA-1, and left as named when Modrinth does not answer", async () => {
		const mods = [
			{ file: 'a.jar', url: 'https://cdn.modrinth.com/data/AAA/versions/1/a.jar' },
			{ file: 'b.jar', curseforge: '1', sha1: 'bbb' },
			{ file: 'c.jar', curseforge: '2', sha1: 'ccc' },
		];

		await describeMods(mods, {
			projectsByHash: async hashes => new Map(hashes.filter(hash => hash === 'bbb').map(hash => [hash, 'BBB'])),
			projectsById: async ids =>
				new Map(
					ids.map(id => [
						id,
						{
							slug: id.toLowerCase(),
							title: `${id} Mod`,
							...(id === 'AAA' ? { source: 'https://github.com/a/a' } : {}),
						},
					]),
				),
		});

		expect(mods).toEqual([
			{
				file: 'a.jar',
				url: 'https://cdn.modrinth.com/data/AAA/versions/1/a.jar',
				modrinth: 'AAA',
				slug: 'aaa',
				title: 'AAA Mod',
				source: 'https://github.com/a/a',
			},
			{ file: 'b.jar', curseforge: '1', sha1: 'bbb', modrinth: 'BBB', slug: 'bbb', title: 'BBB Mod' },
			{ file: 'c.jar', curseforge: '2', sha1: 'ccc' },
		]);

		const kept = [{ file: 'd.jar', sha1: 'ddd' }];

		await describeMods(kept, {
			projectsByHash: async () => {
				throw new Error('Modrinth 503');
			},
			projectsById: async () => new Map(),
		});
		expect(kept).toEqual([{ file: 'd.jar', sha1: 'ddd' }]);
	});

	test('counts the packs using each repository, once a pack however often it names it, for the crawl to read first', () => {
		const demand = packDemand(
			[
				{
					formats: {
						packwiz: { mods: [{ modrinth: 'gone' }, { url: 'https://cdn.modrinth.com/data/gone/versions/1/g.jar' }] },
					},
				},
				{
					formats: {
						mrpack: { mods: [{ url: 'https://github.com/q/fresh/releases/download/v1/f.jar' }, { modrinth: 'gone' }] },
					},
				},
				{ formats: { packwiz: { mods: [{ source: 'https://codeberg.org/o/m' }] } } },
			],
			modrinthIds,
		);

		expect([...demand]).toEqual([
			['z/not-indexed', 2],
			['q/fresh', 1],
			['codeberg:o/m', 1],
		]);
	});

	test("is told by a pack's ender pack before its packwiz one, and by its .mrpack last, installed by its link", () => {
		const both = buildPacks(
			[
				{
					repo: 'p/both',
					host: 'github',
					formats: {
						mrpack: { name: 'Released', mods: [], url: 'https://github.com/p/both/releases/download/v1/p.mrpack' },
						ender: { name: 'Ender', minecraft: '26.3', loader: 'fabric', mods: [{ spec: 'gh:b/named' }] },
					},
				},
				{
					repo: 'p/released',
					host: 'github',
					formats: {
						mrpack: { name: 'Released', mods: [], url: 'https://github.com/p/released/releases/download/v1/r.mrpack' },
					},
				},
			],
			entries,
			records,
		);

		expect(both[0]).toMatchObject({ name: 'Ender', matched: ['github:b/named'], install: 'ender import gh:p/both' });
		expect(both[1].install).toBe('ender import https://github.com/p/released/releases/download/v1/r.mrpack');
	});

	test('reads an ender pack published to a gist, installed and paged by the gist, not by a repository', async () => {
		const pack = { name: 'Gisted', minecraft: '26.3', loader: 'fabric', mods: ['gh:b/named'] };
		const body = {
			id: 'abc123',
			owner: { login: 'p' },
			description: 'ender pack: Gisted',
			updated_at: '2026-10-28T00:00:00Z',
			files: { 'ender.pack.json': { truncated: true, raw_url: 'https://gist.example/raw' } },
		};
		const read = async url => (url === 'https://gist.example/raw' ? JSON.stringify(pack) : '');
		const recorded = await gistPack(body, { now: 'now', read });

		expect(await gistPack({ ...body, files: { 'notes.md': { content: '' } } }, { now: 'now' })).toBeUndefined();
		expect(recorded).toMatchObject({ repo: 'p/abc123', host: 'gist' });
		expect(recorded).not.toHaveProperty('stars');
		expect(recorded.description).toBeUndefined();
		expect((await gistPack({ ...body, description: 'Our server' }, { now: 'now', read })).description).toBe(
			'Our server',
		);

		const [listed] = buildPacks([recorded], entries, records);

		expect(listed).toMatchObject({ name: 'Gisted', matched: ['github:b/named'], install: 'ender import gist:abc123' });
		expect(packPage(listed)).toBe('gist/p/abc123');
		expect(packPage({ host: 'github', repo: 'p/abc123' })).toBe('p/abc123');
	});

	test('takes from code search only the repositories whose pack file is at their root', () => {
		expect(
			packsFrom([
				{ path: 'pack.toml', repository: { full_name: 'a/root' } },
				{ path: 'Packwiz/26.3/pack.toml', repository: { full_name: 'b/nested' } },
			]),
		).toEqual(['a/root']);
	});
});

test("a pack's file GitHub answers 429 for is its rate limit, set aside rather than failed", async () => {
	const answering = status => async () => new Response(status === 200 ? 'x' : null, { status });

	await expect(fileAt('a/b', 'pack.toml', { fetching: answering(429) })).rejects.toBeInstanceOf(RateLimited);
	await expect(fileAt('a/b', 'pack.toml', { fetching: answering(500) })).rejects.toThrow('pack.toml answered 500');
	expect(await fileAt('a/b', 'pack.toml', { fetching: answering(404) })).toBeUndefined();
	expect(await fileAt('a/b', 'pack.toml', { fetching: answering(200) })).toBe('x');
});

describe('a .mrpack on a host that serves ranges', () => {
	test('gives its index without the rest of the archive being read', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'ender-mrpack-'));

		try {
			const index = JSON.stringify({ name: 'Big', files: [{ path: 'mods/a.jar' }] });

			await writeFile(join(directory, 'modrinth.index.json'), index);
			await writeFile(join(directory, 'world.bin'), randomBytes(3 * 1024 * 1024));
			Bun.spawnSync(['zip', '-q', '-9', 'pack.mrpack', 'world.bin', 'modrinth.index.json'], { cwd: directory });

			const bytes = new Uint8Array(await Bun.file(join(directory, 'pack.mrpack')).arrayBuffer());
			let read = 0;
			const entry = await zipEntryByRanges('pack', bytes.length, 'modrinth.index.json', {
				read: async (url, from, to) => {
					read += to - from + 1;

					return bytes.slice(from, to + 1);
				},
			});

			expect(new TextDecoder().decode(entry)).toBe(index);
			expect(read).toBeLessThan(bytes.length / 4);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
