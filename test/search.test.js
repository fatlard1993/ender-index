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

const record = (repo, releases) => ({ repo, host: 'github', stars: 1, releases });

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
