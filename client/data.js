import { INDEX, MANIFEST, releasedVersions } from './search';
import { loadJson } from './ui';

let listing;
let versions;
let themes;
let packs;

/** The index's listing, fetched once however many pages ask: it is the size of every repository's summary. */
export const loadListing = () => {
	listing ??= loadJson(`${INDEX}/search.json`).then(entries => entries.filter(entry => !entry.archived));
	listing.catch(() => (listing = undefined));

	return listing;
};

/** Released Minecraft versions, newest first, or none when Mojang does not answer. */
export const loadVersions = () => {
	versions ??= loadJson(MANIFEST)
		.then(releasedVersions)
		.catch(error => {
			versions = undefined;

			throw error;
		});

	return versions;
};

/** The themes the index's tags came down to, the commonest first, or none when they do not load. */
export const loadThemes = () => {
	themes ??= loadJson(`${INDEX}/tags.json`).catch(() => {
		themes = undefined;

		return [];
	});

	return themes;
};

/** The packs the index lists, fetched once; none before a crawl has listed any. */
export const loadPacks = () => {
	packs ??= fetch(`${INDEX}/packs.json`).then(async response => {
		if (response.status === 404) return [];
		if (!response.ok) throw new Error(`${INDEX}/packs.json answered ${response.status}`);

		return response.json();
	});
	packs.catch(() => (packs = undefined));

	return packs;
};
