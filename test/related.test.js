import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { ownerOf } from 'ender-launcher/rank';

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
import { collectionKey } from '../client/search';

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

// The relations as the page found them by scanning the listing for each mod, to hold the looked-up ones to
const byStars = (a, b) => (b.stars ?? 0) - (a.stars ?? 0);
const scanning = {
	sameAuthor: (entry, listing) =>
		listing.filter(other => other !== entry && ownerOf(other) === ownerOf(entry)).toSorted(byStars),
	needsOf: (entry, listing) => {
		const byKey = new Map(listing.map(other => [collectionKey(other), other]));

		return (entry.needs ?? []).map(key => byKey.get(key)).filter(Boolean);
	},
	neededBy: (entry, listing) => listing.filter(other => other.needs?.includes(collectionKey(entry))).toSorted(byStars),
	declared: (entry, listing, ...fields) => {
		const key = collectionKey(entry);
		const byKey = new Map(listing.map(other => [collectionKey(other), other]));
		const named = fields.flatMap(field => entry[field] ?? []).map(other => byKey.get(other));
		const naming = listing.filter(other => fields.some(field => other[field]?.includes(key)));

		return [...new Set([...named, ...naming])].filter(other => other && other !== entry).toSorted(byStars);
	},
	similarTo: (entry, listing, { most = 6, leaving = [] } = {}) => {
		const themes = new Set(entry.tags ?? []);

		if (themes.size === 0) return [];

		const counts = new Map();

		for (const other of listing) for (const tag of other.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);

		const rarity = new Map([...counts].map(([tag, count]) => [tag, Math.log(listing.length / count)]));
		const shown = new Set([entry, ...leaving]);

		return listing
			.filter(other => !shown.has(other) && ownerOf(other) !== ownerOf(entry))
			.map(other => ({
				other,
				score: (other.tags ?? []).filter(tag => themes.has(tag)).reduce((sum, tag) => sum + rarity.get(tag), 0),
			}))
			.filter(({ score }) => score >= Math.log(50))
			.sort((a, b) => b.score - a.score || byStars(a.other, b.other))
			.slice(0, most)
			.map(({ other }) => other);
	},
};

const keys = entries => entries.map(collectionKey);

const mod = (repo, extra = {}) => ({ host: 'github', repo, stars: 1, ...extra });
const small = [
	mod('a/lib', { stars: 90, tags: ['tech', 'library'] }),
	mod('a/app', { stars: 5, needs: ['github:a/lib'], suggests: ['github:b/pal'], tags: ['tech', 'storage'] }),
	mod('b/pal', { stars: 40, breaks: ['github:c/foe'], tags: ['storage', 'tech'] }),
	mod('c/foe', { stars: 40, conflicts: ['github:a/app'], tags: ['storage', 'rare'] }),
	mod('d/kin', { stars: 40, needs: ['github:a/lib', 'github:a/lib'], tags: ['storage', 'rare'] }),
];

const sameAnswers = (listing, entries) => {
	for (const entry of entries) {
		const needs = needsOf(entry, listing);
		const needed = neededBy(entry, listing);
		const works = worksWith(entry, listing);
		const clashes = clashesWith(entry, listing);
		const leaving = [...needs, ...needed, ...works, ...clashes];

		expect(keys(sameAuthor(entry, listing))).toEqual(keys(scanning.sameAuthor(entry, listing)));
		expect(keys(needs)).toEqual(keys(scanning.needsOf(entry, listing)));
		expect(keys(needed)).toEqual(keys(scanning.neededBy(entry, listing)));
		expect(keys(works)).toEqual(keys(scanning.declared(entry, listing, 'suggests')));
		expect(keys(clashes)).toEqual(keys(scanning.declared(entry, listing, 'breaks', 'conflicts')));
		expect(keys(similarTo(entry, listing, { leaving }))).toEqual(keys(scanning.similarTo(entry, listing, { leaving })));
	}
};

describe("a mod's relations, looked up rather than scanned for", () => {
	test("answer as scanning the listing did, each way round and each tie in the listing's order", () => {
		sameAnswers(small, small);
		expect(keys(neededBy(small[0], small))).toEqual(['github:d/kin', 'github:a/app']);
		expect(keys(clashesWith(small[2], small))).toEqual(['github:c/foe']);
	});

	test('answer as scanning did across the listing the index publishes, where there is one', async () => {
		const file = Bun.file(join(import.meta.dir, '..', 'data', 'search.json'));

		if (!(await file.exists())) return;

		const listing = (await file.json()).filter(entry => !entry.archived);

		sameAnswers(
			listing,
			listing.filter((_, at) => at % 250 === 0),
		);
	});
});
