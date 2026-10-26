import { describe, expect, test } from 'bun:test';

import { copyLibraryStylesheets } from '../scripts/buildSite';
import {
	avatarUrl,
	collectionKey,
	downloadCounts,
	fileSize,
	fittingVersions,
	installAllCommand,
	installCommand,
	modPath,
	readmeSources,
	readmeUrl,
	recordUrl,
	releasesApi,
	readQuery,
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
		expect(readQuery(writeQuery(state))).toEqual({ query: 'fabric api', minecraft: '1.21.1', loader: 'fabric' });
		expect(writeQuery({ query: '' })).toBe('');
		expect(readQuery('?loader=bukkit')).toEqual({ query: '', minecraft: undefined, loader: undefined });
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

	test('a repository whose jars name no mods is called by its own name', () => {
		expect(titleOf(entry())).toBe('Lithium');
		expect(titleOf(entry({ latest: { mods: [] } }))).toBe('CaffeineMC/lithium');
	});

	test('the stylesheets the page links come with the fonts they name, since Pages serves only files', async () => {
		const out = `${import.meta.dir}/../.cache/site-test`;

		await copyLibraryStylesheets(out);

		expect(await Bun.file(`${out}/@fortawesome/fontawesome-free/css/all.css`).exists()).toBe(true);
		expect(await Bun.file(`${out}/@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2`).exists()).toBe(true);
		expect(
			await Bun.file(`${out}/@fontsource-variable/kode-mono/files/kode-mono-latin-wght-normal.woff2`).exists(),
		).toBe(true);
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

	test('fetches a GitLab readme through its API, which answers a page from another origin', () => {
		expect(readmeSources(entry({ host: 'gitlab', repo: 'g/p' })).candidates[0]).toBe(
			'https://gitlab.com/api/v4/projects/g%2Fp/repository/files/README.md/raw?ref=HEAD',
		);
	});

	test('counts downloads by tag and file, where the host reports them', () => {
		const counts = downloadCounts([
			{ tag_name: '1.0', assets: [{ name: 'a.jar', download_count: 5 }] },
			{ tag_name: '0.9', assets: [{ name: 'a.jar' }] },
		]);

		expect(counts.get('1.0/a.jar')).toBe(5);
		expect(counts.get('0.9/a.jar')).toBe(0);
		expect(releasesApi(entry({ host: 'gitlab' }))).toBeUndefined();
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
