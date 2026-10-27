import { fit, ownerOf } from 'ender-launcher/rank';

import { collectionKey } from './search';

const byStars = (a, b) => (b.stars ?? 0) - (a.stars ?? 0);

/** The rest of the mods its owner has in the index, the most starred first. */
export const sameAuthor = (entry, listing) =>
	listing.filter(other => other !== entry && ownerOf(other) === ownerOf(entry)).toSorted(byStars);

/** What the crawl resolved its mods to need, in the order it named them. */
export const needsOf = (entry, listing) => {
	const byKey = new Map(listing.map(other => [collectionKey(other), other]));

	return (entry.needs ?? []).map(key => byKey.get(key)).filter(Boolean);
};

/** The repositories the crawl resolved to need it, the most starred first. */
export const neededBy = (entry, listing) => {
	const key = collectionKey(entry);

	return listing.filter(other => other.needs?.includes(key)).toSorted(byStars);
};

/** The repositories it names in one of its declared relations, and those naming it there, the most starred first. */
const declared = (entry, listing, ...fields) => {
	const key = collectionKey(entry);
	const byKey = new Map(listing.map(other => [collectionKey(other), other]));
	const named = fields.flatMap(field => entry[field] ?? []).map(other => byKey.get(other));
	const naming = listing.filter(other => fields.some(field => other[field]?.includes(key)));

	return [...new Set([...named, ...naming])].filter(other => other && other !== entry).toSorted(byStars);
};

/** What it says it works with, and what says it works with it. */
export const worksWith = (entry, listing) => declared(entry, listing, 'suggests');

/** What it refuses to run beside, or warns about, either way round. */
export const clashesWith = (entry, listing) => declared(entry, listing, 'breaks', 'conflicts');

const rarities = new WeakMap();

/** How rare each theme is across a listing: one few mods share says more when two do. */
const rarityOf = listing => {
	let rarity = rarities.get(listing);

	if (rarity === undefined) {
		const counts = new Map();

		for (const entry of listing) for (const tag of entry.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);

		rarity = new Map([...counts].map(([tag, count]) => [tag, Math.log(listing.length / count)]));
		rarities.set(listing, rarity);
	}

	return rarity;
};

/** The least two mods have to share to be called alike: two themes of middling rarity, or one rare one. */
const ALIKE = Math.log(50);

/**
 * Other authors' mods sharing its themes, the rarer the shared themes the closer, and the most starred first among
 * equals. Its own author's are listed apart, and `leaving` names the ones already shown elsewhere.
 */
export const similarTo = (entry, listing, { most = 6, leaving = [] } = {}) => {
	const themes = new Set(entry.tags ?? []);

	if (themes.size === 0) return [];

	const rarity = rarityOf(listing);
	const shown = new Set([entry, ...leaving]);

	return listing
		.filter(other => !shown.has(other) && ownerOf(other) !== ownerOf(entry))
		.map(other => ({
			other,
			score: (other.tags ?? []).filter(tag => themes.has(tag)).reduce((sum, tag) => sum + rarity.get(tag), 0),
		}))
		.filter(({ score }) => score >= ALIKE)
		.sort((a, b) => b.score - a.score || byStars(a.other, b.other))
		.slice(0, most)
		.map(({ other }) => other);
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
