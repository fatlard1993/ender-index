import { ownerOf } from 'ender-launcher/rank';

import { relationsOf, sameAuthor } from './related';

/** The most mods a group of tiles shows, the most starred; its heading counts them all. */
export const TILES = 6;

/** The id of the script a mod's page carries its own data in, where its build put one: on GitHub Pages. */
export const PAGE_DATA = 'mod-page';

/** What a tile says a mod is: its own description, or the summary the index made it. */
const aboutFields = entry => {
	if (entry.description) return { description: entry.description };

	return entry.summary ? { summary: entry.summary } : {};
};

/** A mod as a tile shows it: what its page is at, its picture, title, description and stars, and nothing else. */
export const tileOf = entry => ({
	host: entry.host ?? 'github',
	repo: entry.repo,
	stars: entry.stars ?? 0,
	...(entry.icon ? { icon: entry.icon } : {}),
	...aboutFields(entry),
	latest: { mods: (entry.latest?.mods ?? []).map(({ id, name }) => ({ id, ...(name ? { name } : {}) })) },
});

/**
 * What a mod's page shows that the listing would otherwise be fetched for: the mod's own entry, each of its relations
 * as the tiles shown and how many there are, and how many other mods its owner has. Some kilobytes, where the listing
 * is megabytes.
 */
export const pageDataOf = (entry, listing) => ({
	entry,
	relations: Object.fromEntries(
		Object.entries(relationsOf(entry, listing)).map(([relation, mods]) => [
			relation,
			{ count: mods.length, tiles: mods.slice(0, TILES).map(tileOf) },
		]),
	),
	author: { count: sameAuthor(entry, listing).length },
});

/** Where an owner's mods are, as tiles, beside the pages: authors/<host>/<owner>.json; undefined for a name unsafe there. */
export const authorFile = key => {
	const [host, owner] = key.split(':');

	return /^[a-z]+$/.test(host) && /^[\w.-]+$/.test(owner) && !/^\.+$/.test(owner)
		? `authors/${host}/${owner}.json`
		: undefined;
};

/** Each owner's mods as tiles, the most starred first, by the file each is kept in. */
export const authorFiles = listing => {
	const files = new Map();

	for (const [key, mods] of Map.groupBy(listing, entry => ownerOf(entry))) {
		const file = authorFile(key);

		if (file) files.set(file, mods.toSorted((a, b) => (b.stars ?? 0) - (a.stars ?? 0)).map(tileOf));
	}

	return files;
};

/** The script carrying a page's data, safe inside HTML: nothing in it can close the script or start another tag. */
export const pageDataScript = data =>
	`<script type="application/json" id="${PAGE_DATA}">${JSON.stringify(data)
		.replaceAll('<', '\\u003c')
		.replaceAll('\u2028', '\\u2028')
		.replaceAll('\u2029', '\\u2029')}</script>`;

/** A page's data from the script's text, when it is for this mod; undefined otherwise. */
export const pageDataFrom = (text, { host, repo }) => {
	try {
		const data = JSON.parse(text);

		return data?.entry?.repo === repo && (data.entry.host ?? 'github') === host && data.relations ? data : undefined;
	} catch {
		return undefined;
	}
};

/** A page's data from a page's HTML, as fetched for a mod opened from another page; undefined when it carries none. */
export const pageDataIn = (html, mod) => {
	const found = html.match(new RegExp(`<script type="application/json" id="${PAGE_DATA}">([^<]*)</script>`));

	return found ? pageDataFrom(found[1], mod) : undefined;
};
