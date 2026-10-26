import { describe, expect, test } from 'bun:test';

import { reposFrom } from '../src/discover';
import { buildSearch } from '../src/search';

const asset = extra => ({
	name: 'mod.jar',
	sha256: 'x',
	mods: [{ loader: 'fabric', id: 'mod', name: 'Mod', minecraft: '>=1.21', environment: '*', depends: [] }],
	scan: { capabilities: { network: {} } },
	...extra,
});

const record = (repo, releases, extra) => ({ repo, host: 'github', stars: 1, releases, ...extra });

describe('the search file', () => {
	test('lists the newest release that is not a prerelease, with what it declares and can reach', () => {
		const [entry] = buildSearch([
			record('a/mod', [
				{ tag: '2.0-beta', prerelease: true, assets: [asset()] },
				{ tag: '1.0', prerelease: false, assets: [asset()] },
			]),
		]);

		expect(entry.latest.tag).toBe('1.0');
		expect(entry.latest.mods).toEqual([
			{ loader: 'fabric', id: 'mod', name: 'Mod', minecraft: '>=1.21', environment: '*' },
		]);
		expect(entry.latest.capabilities).toEqual(['network']);
		expect(entry.latest.provides).toEqual([]);
		expect(entry.replaced).toBe(false);
	});

	test('lists every loader and game range any watched release targets', () => {
		const [entry] = buildSearch([
			record('a/mod', [
				{ tag: '2.0', prerelease: false, assets: [asset()] },
				{
					tag: '1.0',
					prerelease: false,
					assets: [asset({ mods: [{ loader: 'neoforge', id: 'mod', minecraft: '[1.21,1.22)' }] })],
				},
			]),
		]);

		expect(entry.targets).toEqual([
			{ loader: 'fabric', minecraft: '>=1.21' },
			{ loader: 'neoforge', minecraft: '[1.21,1.22)' },
		]);
	});

	test('falls back to a prerelease when that is all there is', () => {
		expect(
			buildSearch([record('a/mod', [{ tag: '1.0-beta', prerelease: true, assets: [asset()] }])])[0].latest.tag,
		).toBe('1.0-beta');
	});

	test('skips releases whose only jars failed or are gone, and repositories left with nothing', () => {
		const entries = buildSearch([
			record('a/broken', [{ tag: '1.0', prerelease: false, assets: [asset({ error: 'download answered 502' })] }]),
			record('b/mod', [
				{ tag: '2.0', prerelease: false, assets: [asset({ gone: '2026-10-23' })] },
				{ tag: '1.0', prerelease: false, assets: [asset()] },
			]),
		]);

		expect(entries.map(entry => `${entry.repo}@${entry.latest.tag}`)).toEqual(['b/mod@1.0']);
	});

	test('a repository its host no longer has is not listed', () => {
		const releases = [{ tag: '1.0', prerelease: false, assets: [asset()] }];

		expect(
			buildSearch([{ ...record('a/gone', releases), gone: '2026-10-25' }, record('b/mod', releases)]).map(
				entry => entry.repo,
			),
		).toEqual(['b/mod']);
	});

	test('a repository whose jars declare no mod is not listed', () => {
		const entries = buildSearch([
			record('a/installer', [{ tag: '1.0', prerelease: false, assets: [asset({ mods: [] })] }]),
			record('b/tool', [
				{ tag: '1.0', prerelease: false, assets: [asset({ mods: undefined, metadataError: 'bad json' })] },
			]),
		]);

		expect(entries).toEqual([]);
	});

	test('says when any release of a repository had an asset replaced', () => {
		const [entry] = buildSearch([
			record('a/mod', [{ tag: '1.0', prerelease: false, assets: [asset({ replaced: [{ id: 1, sha256: 'y' }] })] }]),
		]);

		expect(entry.replaced).toBe(true);
	});
});

describe('discovery', () => {
	test('counts the downloads its hosts report for every jar read, and nothing for a host that reports none', () => {
		const [counted, uncounted] = buildSearch([
			record('a/counted', [
				{ tag: '2.0', prerelease: false, assets: [asset({ downloads: 30 })] },
				{ tag: '1.0', prerelease: false, assets: [asset({ downloads: 12, gone: '2026-10-01' })] },
			]),
			record('b/uncounted', [{ tag: '1.0', prerelease: false, assets: [asset()] }], { host: 'gitlab' }),
		]);

		expect(counted.downloads).toBe(42);
		expect(uncounted.downloads).toBeUndefined();
	});

	test('says which side its mods run on', () => {
		const side = environment =>
			buildSearch([
				record('a/mod', [
					{ tag: '1.0', prerelease: false, assets: [asset({ mods: [{ ...asset().mods[0], environment }] })] },
				]),
			])[0].environment;

		expect(side('client')).toBe('client');
		expect(side('server')).toBe('server');
		expect(side('*')).toBe('both');
		expect(side(undefined)).toBe('both');
	});

	test('counts the repositories that require its mod, by the rule the client resolves them by', () => {
		const requiring = depends => ({
			tag: '1.0',
			prerelease: false,
			assets: [asset({ mods: [{ loader: 'fabric', id: `needs-${depends}`, depends: [depends, 'minecraft'] }] })],
		});
		const providing = id => ({
			tag: '1.0',
			prerelease: false,
			assets: [asset({ mods: [{ loader: 'fabric', id, name: id, depends: [] }] })],
		});
		const entries = buildSearch([
			record('real/sodium', [providing('sodium')], { stars: 500 }),
			record('copy/sodium', [providing('sodium')], { stars: 0 }),
			record('a/iris', [requiring('sodium')]),
			record('b/addon', [requiring('sodium')]),
			record('me/library', [providing('library')], { stars: 0 }),
			record('me/mod', [requiring('library')]),
			record('you/mod', [requiring('library')]),
		]);
		const usedBy = repo => entries.find(entry => entry.repo === repo).usedBy;

		expect(usedBy('real/sodium')).toBe(2);
		expect(usedBy('copy/sodium')).toBeUndefined();
		expect(usedBy('me/library')).toBe(1);
	});

	test("says when its mod has an established one's id or name, and says nothing otherwise", () => {
		const declaring = (id, name) => [
			{ tag: '1.0', prerelease: false, assets: [asset({ mods: [{ loader: 'fabric', id, name, depends: [] }] })] },
		];
		const entries = buildSearch([
			record('real/sodium', declaring('sodium', 'Sodium'), { stars: 500 }),
			record('copy/client', declaring('sodium', 'Sodium'), { stars: 0 }),
			record('own/mod', declaring('other', 'Other'), { stars: 0 }),
		]);
		const shares = repo => entries.find(entry => entry.repo === repo).shares;

		expect(shares('copy/client')).toBe('declares "sodium", as real/sodium does');
		expect(shares('own/mod')).toBe('');
		expect(shares('real/sodium')).toBe('');
		expect(entries.find(entry => entry.repo === 'real/sodium').author).toBe('');
	});

	test('names the established repository of the same owner that vouches for a new one', () => {
		const declaring = id => [
			{ tag: '1.0', prerelease: false, assets: [asset({ mods: [{ loader: 'fabric', id, name: id, depends: [] }] })] },
		];
		const entries = buildSearch([
			record('maker/famous', declaring('famous'), { stars: 900 }),
			record('maker/fresh', declaring('fresh'), { stars: 0 }),
			record('stranger/fresh', declaring('other'), { stars: 0 }),
		]);
		const author = repo => entries.find(entry => entry.repo === repo).author;

		expect(author('maker/fresh')).toBe('maker/famous');
		expect(author('stranger/fresh')).toBe('');
	});

	test('summarizes a repository that describes itself nowhere, by its jar unless a template wrote it, or its readme', () => {
		const describing = description => [
			{ tag: '1.0', prerelease: false, assets: [asset({ mods: [{ ...asset().mods[0], description }] })] },
		];
		const [described, jar, template, none] = buildSearch([
			record('a/described', describing('From the jar'), { description: 'Its own words' }),
			record('b/jar', describing('Ships you can walk on')),
			record('c/template', describing('This is an example description! Tell everyone what your mod is about!'), {
				readmeSummary: 'From the readme',
			}),
			record('d/none', describing(undefined)),
		]);

		expect(described.summary).toBeUndefined();
		expect(jar.summary).toEqual({ text: 'Ships you can walk on', from: 'jar' });
		expect(template.summary).toEqual({ text: 'From the readme', from: 'readme' });
		expect(none.summary).toBeUndefined();
	});

	test('a manifest under a test or example directory does not make a repository a mod', () => {
		const items = [
			{ path: 'src/main/resources/fabric.mod.json', repository: { full_name: 'a/mod' } },
			{ path: 'src/test/resources/fabric.mod.json', repository: { full_name: 'b/launcher' } },
			{ path: 'scripts/fixtures/mod-install/fabric.mod.json', repository: { full_name: 'c/tool' } },
			{ path: 'examples/basic/src/main/resources/fabric.mod.json', repository: { full_name: 'd/library' } },
		];

		expect(reposFrom(items)).toEqual(['a/mod']);
	});
});
