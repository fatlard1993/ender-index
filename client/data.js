import { INDEX, MANIFEST, releasedVersions } from './search';
import { loadJson } from './ui';

let listing;
let versions;

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
