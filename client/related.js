import { fit, ownerOf } from 'ender-launcher/rank';

import { collectionKey } from './search';

const byStars = (a, b) => (b.stars ?? 0) - (a.stars ?? 0);

/** The least two mods have to share to be called alike: two themes of middling rarity, or one rare one. */
const ALIKE = Math.log(50);

const indexes = new WeakMap();

/**
 * A listing looked up every way relations are found, made once for it: a page asks about one mod, and the site's build
 * about every mod in turn, which by scanning the listing for each took an hour. What each function answers is as it
 * was by scanning; ties keep the listing's order.
 */
const indexOf = listing => {
	let index = indexes.get(listing);

	if (index !== undefined) return index;

	const reverse = field => {
		const naming = new Map();

		for (const other of listing)
			for (const key of new Set(other[field] ?? [])) naming.set(key, [...(naming.get(key) ?? []), other]);

		return naming;
	};
	const counts = new Map();
	const byTag = new Map();

	for (const entry of listing)
		for (const tag of new Set(entry.tags ?? [])) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
			byTag.set(tag, [...(byTag.get(tag) ?? []), entry]);
		}

	index = {
		order: new Map(listing.map((entry, at) => [entry, at])),
		byKey: new Map(listing.map(other => [collectionKey(other), other])),
		byOwner: Map.groupBy(listing, other => ownerOf(other)),
		needing: reverse('needs'),
		naming: { suggests: reverse('suggests'), breaks: reverse('breaks'), conflicts: reverse('conflicts') },
		// How rare each theme is across a listing: one few mods share says more when two do
		rarity: new Map([...counts].map(([tag, count]) => [tag, Math.log(listing.length / count)])),
		byTag,
	};
	indexes.set(listing, index);

	return index;
};

const inOrder = (index, entries) => entries.toSorted((a, b) => index.order.get(a) - index.order.get(b));

/** The rest of the mods its owner has in the index, the most starred first. */
export const sameAuthor = (entry, listing) =>
	(indexOf(listing).byOwner.get(ownerOf(entry)) ?? []).filter(other => other !== entry).toSorted(byStars);

/** What the crawl resolved its mods to need, in the order it named them. */
export const needsOf = (entry, listing) => {
	const { byKey } = indexOf(listing);

	return (entry.needs ?? []).map(key => byKey.get(key)).filter(Boolean);
};

/** The repositories the crawl resolved to need it, the most starred first. */
export const neededBy = (entry, listing) =>
	(indexOf(listing).needing.get(collectionKey(entry)) ?? []).toSorted(byStars);

/** The repositories it names in one of its declared relations, and those naming it there, the most starred first. */
const declared = (entry, listing, ...fields) => {
	const index = indexOf(listing);
	const key = collectionKey(entry);
	const named = fields.flatMap(field => entry[field] ?? []).map(other => index.byKey.get(other));
	const naming = inOrder(index, [...new Set(fields.flatMap(field => index.naming[field].get(key) ?? []))]);

	return [...new Set([...named, ...naming])].filter(other => other && other !== entry).toSorted(byStars);
};

/** What it says it works with, and what says it works with it. */
export const worksWith = (entry, listing) => declared(entry, listing, 'suggests');

/** What it refuses to run beside, or warns about, either way round. */
export const clashesWith = (entry, listing) => declared(entry, listing, 'breaks', 'conflicts');

/**
 * Other authors' mods sharing its themes, the rarer the shared themes the closer, and the most starred first among
 * equals. Its own author's are listed apart, and `leaving` names the ones already shown elsewhere. Only mods sharing a
 * theme rare enough are looked at: with n themes, one alike shares at least one worth ALIKE / n.
 */
export const similarTo = (entry, listing, { most = 6, leaving = [] } = {}) => {
	const themes = new Set(entry.tags ?? []);

	if (themes.size === 0) return [];

	const index = indexOf(listing);
	const floor = ALIKE / themes.size;
	const shown = new Set([entry, ...leaving]);
	const candidates = new Set(
		[...themes].filter(tag => index.rarity.get(tag) >= floor).flatMap(tag => index.byTag.get(tag) ?? []),
	);

	return inOrder(index, [...candidates])
		.filter(other => !shown.has(other) && ownerOf(other) !== ownerOf(entry))
		.map(other => ({
			other,
			score: [...new Set(other.tags ?? [])]
				.filter(tag => themes.has(tag))
				.reduce((sum, tag) => sum + index.rarity.get(tag), 0),
		}))
		.filter(({ score }) => score >= ALIKE)
		.sort((a, b) => b.score - a.score || byStars(a.other, b.other))
		.slice(0, most)
		.map(({ other }) => other);
};

/** Every relation a mod page shows, in the order it shows them; `alike` leaves out what the others already name. */
export const relationsOf = (entry, listing) => {
	const needs = needsOf(entry, listing);
	const needed = neededBy(entry, listing);
	const works = worksWith(entry, listing);
	const clashes = clashesWith(entry, listing);

	return {
		needs,
		needed,
		works,
		clashes,
		alike: similarTo(entry, listing, { leaving: [...needs, ...needed, ...works, ...clashes] }),
	};
};

/** Every jar its record keeps, newest release first, each with the release it came in. */
export const downloadsOf = record =>
	(record.releases ?? []).flatMap(release => release.assets.map(asset => ({ release, asset })));

const describing = ({ release, asset }) => [
	release.tag,
	asset.name,
	...(asset.mods ?? []).flatMap(mod => [mod.name, mod.version, mod.minecraft]),
];

/** The jars that fit a game version and loader, and whose release, file or mods name every word typed. */
export const matchingDownloads = (downloads, { minecraft, loader, text = '' } = {}) => {
	const words = text.toLowerCase().split(/\s+/).filter(Boolean);

	return downloads.filter(
		download =>
			fit(download.asset.mods, { minecraft, loader }) > 0 &&
			words.every(word => describing(download).some(field => field?.toLowerCase().includes(word))),
	);
};

/** The jar to offer first: the newest still there that fits, a full release before a prerelease. */
export const bestDownload = (downloads, fits) => {
	const fitting = downloads.filter(({ asset }) => !asset.gone && fit(asset.mods, fits) === 2);

	return fitting.find(({ release }) => !release.prerelease) ?? fitting[0];
};

/** The released game versions some jar declares, newest first, for choosing among. */
export const downloadVersions = (downloads, versions) =>
	versions.filter(version => downloads.some(({ asset }) => fit(asset.mods, { minecraft: version }) === 2));

/** The loaders its jars are for. */
export const downloadLoaders = downloads => [
	...new Set(downloads.flatMap(({ asset }) => (asset.mods ?? []).map(mod => mod.loader)).filter(Boolean)),
];
