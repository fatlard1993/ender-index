import { describe, expect, test } from 'bun:test';

import {
	bestDownload,
	downloadLoaders,
	downloadVersions,
	downloadsOf,
	matchingDownloads,
	neededBy,
	needsOf,
	sameAuthor,
	similarTo,
	clashesWith,
	worksWith,
} from '../client/related';

const entry = (repo, extra) => ({ repo, host: 'github', stars: 1, description: '', latest: { mods: [] }, ...extra });

describe("a mod's neighbours", () => {
	test("its author's other mods, the most starred first, an owner's name read either case", () => {
		const mine = entry('Me/a');
		const listing = [mine, entry('me/b', { stars: 3 }), entry('me/c', { stars: 9 }), entry('you/d')];

		expect(sameAuthor(mine, listing).map(found => found.repo)).toEqual(['me/c', 'me/b']);
	});

	test('what it needs and what needs it, as the crawl resolved them', () => {
		const api = entry('fabric/api', { stars: 900 });
		const addon = entry('a/addon', { needs: ['github:fabric/api', 'github:gone/lib'] });
		const other = entry('b/other', { stars: 5, needs: ['github:fabric/api'] });
		const listing = [api, addon, other];

		expect(needsOf(addon, listing)).toEqual([api]);
		expect(neededBy(api, listing)).toEqual([other, addon]);
		expect(neededBy(addon, listing)).toEqual([]);
	});

	test("other authors' mods sharing its rarer themes, and none for sharing only a common one", () => {
		const filler = Array.from({ length: 200 }, (_, at) => entry(`filler/m${at}`, { tags: at < 40 ? ['block'] : [] }));
		const boats = entry('me/boats', { tags: ['ship', 'sail', 'block'] });
		const ships = entry('you/ships', { tags: ['ship', 'sail'] });
		const mine = entry('me/rafts', { tags: ['ship', 'sail'] });
		const blocky = entry('x/blocky', { tags: ['block'] });
		const listing = [...filler, boats, ships, mine, blocky];

		expect(similarTo(boats, listing)).toEqual([ships]);
		expect(similarTo(boats, listing, { leaving: [ships] })).toEqual([]);
		expect(similarTo(entry('none/tags'), listing)).toEqual([]);
	});

	test('what it works with and clashes with, either way round, as its authors declared', () => {
		const jei = entry('mezz/jei', { stars: 900 });
		const optifine = entry('sp/optifine', { stars: 800 });
		const mine = entry('me/mod', { suggests: ['github:mezz/jei'], breaks: ['github:sp/optifine'] });
		const addon = entry('you/addon', { suggests: ['github:me/mod'], conflicts: ['github:me/mod'] });
		const listing = [jei, optifine, mine, addon];

		expect(worksWith(mine, listing)).toEqual([jei, addon]);
		expect(clashesWith(mine, listing)).toEqual([optifine, addon]);
		expect(worksWith(jei, listing)).toEqual([mine]);
	});
});

describe("a mod's downloads", () => {
	const jar = (name, minecraft, loader = 'fabric', extra) => ({
		name,
		mods: [{ id: 'm', loader, minecraft, version: name }],
		...extra,
	});
	const record = {
		releases: [
			{ tag: 'v3-beta', prerelease: true, assets: [jar('m-3.jar', '~26.3')] },
			{ tag: 'v2', assets: [jar('m-2.jar', '~26.3'), jar('m-2-neo.jar', '~26.3', 'neoforge')] },
			{ tag: 'v1', assets: [jar('m-1.jar', '~26.2', 'fabric', { gone: '2026-01-01' })] },
		],
	};
	const downloads = downloadsOf(record);
	const names = found => found.map(({ asset }) => asset.name);

	test('lists every jar, newest release first, narrowed by version, loader and words', () => {
		expect(names(downloads)).toEqual(['m-3.jar', 'm-2.jar', 'm-2-neo.jar', 'm-1.jar']);
		expect(names(matchingDownloads(downloads, { minecraft: '26.2' }))).toEqual(['m-1.jar']);
		expect(names(matchingDownloads(downloads, { loader: 'neoforge' }))).toEqual(['m-2-neo.jar']);
		expect(names(matchingDownloads(downloads, { text: 'v2 neo' }))).toEqual(['m-2-neo.jar']);
		expect(names(matchingDownloads(downloads, { text: 'nothing' }))).toEqual([]);
	});

	test('offers the newest full release that fits and is still there', () => {
		expect(bestDownload(downloads, { loader: 'fabric' }).asset.name).toBe('m-2.jar');
		expect(bestDownload(downloads, { minecraft: '26.2' })).toBeUndefined();
		expect(bestDownload(downloadsOf({ releases: [record.releases[0]] }), {}).asset.name).toBe('m-3.jar');
	});

	test('names the versions and loaders its jars are for', () => {
		expect(downloadVersions(downloads, ['26.3', '26.2', '26.1'])).toEqual(['26.3', '26.2']);
		expect(downloadLoaders(downloads)).toEqual(['fabric', 'neoforge']);
	});
});
