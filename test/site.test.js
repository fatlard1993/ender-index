import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { copyLibraryStylesheets } from '../scripts/buildSite';
import {
	avatarUrl,
	collectionKey,
	fileSize,
	fittingVersions,
	installAllCommand,
	installCommand,
	modPath,
	pictureUrl,
	readmeSources,
	readmeUrl,
	screenshotsOf,
	supportOf,
	recordUrl,
	readQuery,
	starKey,
	authorPath,
	tagPath,
	lineUrl,
	packFits,
	rangeLabel,
	refine,
	releaseUrl,
	releasedVersions,
	releasesUrl,
	repositoryUrl,
	titleOf,
	writeQuery,
} from '../client/search';

const entry = (extra = {}) => ({
	repo: 'CaffeineMC/lithium',
	targets: [
		{ loader: 'fabric', minecraft: '~26.3' },
		{ loader: 'fabric', minecraft: '1.21.1' },
	],
	latest: { tag: 'mc26.3-0.26.2', mods: [{ loader: 'fabric', id: 'lithium', name: 'Lithium' }] },
	...extra,
});

describe('the search page', () => {
	test('a search is kept in the address, so it can be linked to', () => {
		const state = { query: ' fabric api ', minecraft: '1.21.1', loader: 'fabric' };

		expect(writeQuery(state)).toBe('?q=fabric+api&mc=1.21.1&loader=fabric');
		expect(readQuery(writeQuery(state))).toMatchObject({ query: 'fabric api', minecraft: '1.21.1', loader: 'fabric' });
		expect(writeQuery({ query: '' })).toBe('');
		expect(readQuery(writeQuery({ starred: true })).starred).toBe(true);
		expect(starKey({ host: 'github', repo: 'CSneko/ctLib' })).toBe('github:csneko/ctlib');
		expect(readQuery('?loader=bukkit&sort=random&avoid=network,teleport')).toMatchObject({
			loader: undefined,
			sort: 'best',
			avoid: ['network'],
		});

		const filtered = {
			query: 'x',
			side: 'client',
			released: '365',
			host: 'codeberg',
			sort: 'downloads',
			avoid: ['exec'],
			support: true,
		};

		expect(readQuery(writeQuery(filtered))).toMatchObject(filtered);
		expect(writeQuery({ author: 'github:fatlard1993' })).toBe('?author=fatlard1993');
		expect(readQuery('?author=FatLard1993').author).toBe('github:fatlard1993');
		expect(readQuery('?author=codeberg:enjarai').author).toBe('codeberg:enjarai');
		expect(readQuery('?author=sourcehut:x').author).toBeUndefined();
		expect(readQuery(writeQuery({ tag: 'ship' })).tag).toBe('ship');
		expect(tagPath('ship')).toBe('?tag=ship#/');
		expect(lineUrl('maruohon/litematica')).toBe('https://github.com/maruohon/litematica');
		expect(lineUrl('gitlab:group/sub/p')).toBe('https://gitlab.com/group/sub/p');
		expect(authorPath(entry({ host: 'gitlab', repo: 'Group/p' }))).toBe('?author=gitlab%3Agroup#/');
	});

	test('a game version range reads as a player would say it, and one of another shape as written', () => {
		expect(rangeLabel('>=1.21.3 <=1.21.4')).toBe('1.21.3 to 1.21.4');
		expect(rangeLabel('>=26.1 <26.2-')).toBe('26.1.x');
		expect(rangeLabel('>=1.21 <1.21.5')).toBe('1.21 up to 1.21.5');
		expect(rangeLabel('>=1.20.1')).toBe('1.20.1 and later');
		expect(rangeLabel('1.21.1 || 1.21.2')).toBe('1.21.1, 1.21.2');
		expect(rangeLabel('~1.21.1')).toBe('1.21.1+');
		expect(rangeLabel('1.21.1')).toBe('1.21.1');
		expect(rangeLabel('[1.21.1,1.21.2)')).toBe('1.21.1');
		expect(rangeLabel('[1.21,1.22)')).toBe('1.21.x');
		expect(rangeLabel('[1.20,1.21]')).toBe('1.20 to 1.21');
		expect(rangeLabel('[1.20,)')).toBe('1.20 and later');
		expect(rangeLabel('*')).toBe('any version');
		expect(rangeLabel('1.21.x-ish weird')).toBe('1.21.x-ish weird');
	});

	test('a pack fits the game version, loader and words chosen, each only when chosen', () => {
		const pack = {
			name: 'Ship Life',
			repo: 'me/ship-life',
			description: 'Boats and pirates',
			minecraft: '26.3',
			loader: 'fabric',
		};

		expect(packFits(pack, {})).toBe(true);
		expect(packFits(pack, { query: 'pirates ship', minecraft: '26.3', loader: 'fabric' })).toBe(true);
		expect(packFits(pack, { minecraft: '1.21.1' })).toBe(false);
		expect(packFits(pack, { loader: 'forge' })).toBe(false);
		expect(packFits(pack, { query: 'trains' })).toBe(false);
	});

	test("each host's pages are where that host keeps them", () => {
		expect(repositoryUrl(entry())).toBe('https://github.com/CaffeineMC/lithium');
		expect(releaseUrl(entry())).toBe('https://github.com/CaffeineMC/lithium/releases/tag/mc26.3-0.26.2');
		expect(releaseUrl(entry({ host: 'codeberg', latest: { tag: '1.0+1.21', mods: [] } }))).toBe(
			'https://codeberg.org/CaffeineMC/lithium/releases/tag/1.0%2B1.21',
		);
		expect(releasesUrl(entry({ host: 'gitlab', repo: 'group/sub/project' }))).toBe(
			'https://gitlab.com/group/sub/project/-/releases',
		);
		expect(releaseUrl(entry({ host: 'gitlab', repo: 'group/project' }))).toBe(
			'https://gitlab.com/group/project/-/releases/mc26.3-0.26.2',
		);
	});

	test('the install line is the spec ender add reads back to the same repository', () => {
		expect(installCommand(entry())).toBe('ender add gh:CaffeineMC/lithium');
		expect(installCommand(entry({ host: 'codeberg' }))).toBe('ender add cb:CaffeineMC/lithium');
		expect(installCommand(entry({ host: 'gitlab' }))).toBe('ender add gl:CaffeineMC/lithium');
	});

	test('the versions named are the one searched for, then the newest the jars declare', () => {
		const versions = releasedVersions({
			versions: [
				{ id: '26.3', type: 'release' },
				{ id: '26.4-snapshot-1', type: 'snapshot' },
				{ id: '26.2', type: 'release' },
				{ id: '1.21.1', type: 'release' },
			],
		});

		expect(versions).toEqual(['26.3', '26.2', '1.21.1']);
		expect(fittingVersions(entry(), versions)).toEqual({ versions: ['26.3', '1.21.1'], more: 0 });
		expect(fittingVersions(entry(), versions, { minecraft: '1.21.1', shown: 1 })).toEqual({
			versions: ['1.21.1'],
			more: 1,
		});
	});

	test('filters narrow the ranked results and a sort reorders them, ties kept in ranked order', () => {
		const now = Date.parse('2026-10-26T00:00:00Z');
		const found = (repo, extra) => ({
			entry: entry({
				repo,
				latest: { tag: '1', published: '2026-10-01T00:00:00Z', mods: [], capabilities: [] },
				...extra,
			}),
		});
		const ranked = [
			found('a/best', { stars: 5, downloads: 10, environment: 'client', tags: ['ship'] }),
			found('b/old', { stars: 9, latest: { published: '2024-01-01T00:00:00Z', mods: [], capabilities: [] } }),
			found('c/network', { stars: 1, downloads: 900, usedBy: 4, latest: { mods: [], capabilities: ['network'] } }),
			found('d/codeberg', {
				stars: 5,
				host: 'codeberg',
				environment: 'server',
				funding: [{ platform: 'ko_fi', url: 'https://ko-fi.com/d' }],
			}),
		];
		const repos = (state = {}) => refine(ranked, state, now).map(({ entry }) => entry.repo);

		expect(repos()).toEqual(['a/best', 'b/old', 'c/network', 'd/codeberg']);
		expect(repos({ side: 'client' })).toEqual(['a/best']);
		expect(repos({ side: 'both' })).toEqual(['b/old', 'c/network']);
		expect(repos({ released: '365' })).toEqual(['a/best', 'd/codeberg']);
		expect(repos({ host: 'codeberg' })).toEqual(['d/codeberg']);
		expect(repos({ avoid: ['network'] })).toEqual(['a/best', 'b/old', 'd/codeberg']);
		expect(repos({ support: true })).toEqual(['d/codeberg']);
		expect(repos({ author: 'github:b' })).toEqual(['b/old']);
		expect(repos({ author: 'github:d' })).toEqual([]);
		expect(repos({ tag: 'ship' })).toEqual(['a/best']);
		expect(repos({ starredKeys: new Set(['github:a/best', 'github:b/old']) })).toEqual(['a/best', 'b/old']);
		expect(repos({ sort: 'stars' })).toEqual(['b/old', 'a/best', 'd/codeberg', 'c/network']);
		expect(repos({ sort: 'downloads' })[0]).toBe('c/network');
		expect(repos({ sort: 'used' })[0]).toBe('c/network');
	});

	test('names each way to support an author for where it leads, a custom link by its site', () => {
		expect(
			supportOf(
				entry({
					funding: [
						{ platform: 'ko_fi', url: 'https://ko-fi.com/maker' },
						{ platform: 'custom', url: 'https://www.example.com/tip' },
					],
				}),
			),
		).toEqual([
			{ url: 'https://ko-fi.com/maker', label: 'Ko-fi' },
			{ url: 'https://www.example.com/tip', label: 'example.com' },
		]);
		expect(supportOf(entry())).toEqual([]);
	});

	test('a repository whose jars name no mods is called by its own name', () => {
		expect(titleOf(entry())).toBe('Lithium');
		expect(titleOf(entry({ latest: { mods: [] } }))).toBe('CaffeineMC/lithium');
	});

	test('the stylesheets the page links come with the fonts they name, since Pages serves only files', async () => {
		const out = await mkdtemp(join(tmpdir(), 'ender-site-'));

		try {
			await copyLibraryStylesheets(out);

			expect(await Bun.file(`${out}/@fortawesome/fontawesome-free/css/all.css`).exists()).toBe(true);
			expect(await Bun.file(`${out}/@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2`).exists()).toBe(true);
			expect(
				await Bun.file(`${out}/@fontsource-variable/kode-mono/files/kode-mono-latin-wght-normal.woff2`).exists(),
			).toBe(true);
		} finally {
			await rm(out, { recursive: true, force: true });
		}
	});
});

describe('a mod page', () => {
	test('is addressed by host and repository, with a nested GitLab group kept to one segment', () => {
		expect(modPath(entry())).toBe('/mod/github/CaffeineMC/lithium');
		expect(modPath(entry({ host: 'gitlab', repo: 'group/sub/project' }))).toBe('/mod/gitlab/group%2Fsub/project');
	});

	test("reads the repository's record from where the index keeps each host's", () => {
		expect(recordUrl(entry(), 'https://x')).toBe('https://x/mods/CaffeineMC/lithium.json');
		expect(recordUrl(entry({ host: 'codeberg' }), 'https://x')).toBe(
			'https://x/mods/codeberg.org/CaffeineMC/lithium.json',
		);
	});

	test('pictures a GitHub owner and leaves the hosts that need a request to find one', () => {
		expect(avatarUrl(entry())).toBe('https://github.com/CaffeineMC.png?size=96');
		expect(avatarUrl(entry({ host: 'codeberg' }))).toBeUndefined();
	});

	test("shows the mod's own icon before its owner's picture", () => {
		expect(pictureUrl(entry({ icon: 'abc.png' }), 96, 'https://x')).toBe('https://x/icons/abc.png');
		expect(pictureUrl(entry())).toBe('https://github.com/CaffeineMC.png?size=96');
	});

	test("resolves a readme's links from the repository root", () => {
		const { raw, page } = readmeSources(entry());

		expect(readmeUrl('docs/shot.png', raw)).toBe(
			'https://raw.githubusercontent.com/CaffeineMC/lithium/HEAD/docs/shot.png',
		);
		expect(readmeUrl('/docs/shot.png', raw)).toBe(readmeUrl('./docs/shot.png', raw));
		expect(readmeUrl('LICENSE', page)).toBe('https://github.com/CaffeineMC/lithium/blob/HEAD/LICENSE');
		expect(readmeUrl('#install', raw)).toBe('#install');
		expect(readmeUrl('https://example.com/a.png', raw)).toBe('https://example.com/a.png');
		expect(readmeUrl('https://github.com/a/b/blob/main/shot.png', raw)).toBe(
			'https://raw.githubusercontent.com/a/b/main/shot.png',
		);
	});

	test('fetches the readme the crawl found, resolving its links from where it sits', () => {
		const found = readmeSources(entry(), '.github/README.md');

		expect(found.candidates).toEqual(['https://raw.githubusercontent.com/CaffeineMC/lithium/HEAD/.github/README.md']);
		expect(readmeUrl('shot.png', found.raw)).toBe(
			'https://raw.githubusercontent.com/CaffeineMC/lithium/HEAD/.github/shot.png',
		);
		expect(readmeUrl('/LICENSE', found.page)).toBe('https://github.com/CaffeineMC/lithium/blob/HEAD/LICENSE');
		expect(readmeSources(entry(), null).candidates).toEqual([]);
		expect(readmeSources(entry()).candidates).toHaveLength(5);
	});

	test("a readme's screenshots are its pictures of the mod, resolved, and not its badges or buttons", () => {
		const { raw } = readmeSources(entry());
		const markdown = [
			'[![Modrinth](https://img.shields.io/modrinth/dt/lithium)](https://modrinth.com/mod/lithium)',
			'![CI](https://github.com/a/b/actions/workflows/ci.yml/badge.svg)',
			'![A sorting machine](docs/sorter.png)',
			'<img src="https://ko-fi.com/img/githubbutton_sm.svg">',
			'<img width="32" src="icon.png">',
			'<p align="center"><img src="https://example.com/farm.gif" width="600"></p>',
			'```md',
			'![not shown](in-code.png)',
			'```',
			'![again](./docs/sorter.png)',
		].join('\n\n');

		expect(screenshotsOf(markdown, raw)).toEqual([
			'https://raw.githubusercontent.com/CaffeineMC/lithium/HEAD/docs/sorter.png',
			'https://example.com/farm.gif',
		]);
		expect(screenshotsOf('![a](a.png) ![b](b.png) ![c](c.png)', raw, 2)).toHaveLength(2);
	});

	test('fetches a GitLab readme through its API, which answers a page from another origin', () => {
		expect(readmeSources(entry({ host: 'gitlab', repo: 'g/p' })).candidates[0]).toBe(
			'https://gitlab.com/api/v4/projects/g%2Fp/repository/files/README.md/raw?ref=HEAD',
		);
	});

	test('says a jar size the way a reader would', () => {
		expect(fileSize(51234)).toBe('50 KB');
		expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB');
		expect(fileSize(10)).toBe('1 KB');
	});
});

describe('a collection', () => {
	test('installs in one line, every mod by the spec ender reads back', () => {
		const collected = [entry(), entry({ host: 'codeberg', repo: 'a/b' })];

		expect(installAllCommand(collected)).toBe('ender add gh:CaffeineMC/lithium cb:a/b');
		expect(installAllCommand(collected, { instance: 'suite' })).toBe(
			'ender add gh:CaffeineMC/lithium cb:a/b --instance suite',
		);
	});

	test('tells the same repository on two hosts apart', () => {
		expect(collectionKey(entry())).not.toBe(collectionKey(entry({ host: 'codeberg' })));
	});
});

describe('the Get ender page', () => {
	test("offers first the line for the visitor's own system", async () => {
		const { INSTALLS, systemOf } = await import('../client/GetPage');

		expect(systemOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
		expect(systemOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('unix');
		expect(systemOf('Mozilla/5.0 (X11; Linux x86_64)')).toBe('unix');
		expect(INSTALLS.unix.command).toBe(
			'curl -fsSL https://raw.githubusercontent.com/fatlard1993/ender-launcher/main/install.sh | sh',
		);
	});
});

test('a mod with only its source installs with --build, which allows ender to build it', () => {
	expect(installCommand({ repo: 'a/b', fromSource: true })).toBe('ender add gh:a/b --build');
	expect(installCommand({ repo: 'a/b' })).toBe('ender add gh:a/b');
	expect(installAllCommand([{ repo: 'a/b' }, { repo: 'a/c', fromSource: true }])).toBe(
		'ender add gh:a/b gh:a/c --build',
	);
});
