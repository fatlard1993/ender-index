import { fetchSteady } from './fetch';

const API = 'https://api.modrinth.com/v2';

/** Modrinth asks every client to name itself and where it can be reached. */
const AGENT = 'fatlard1993/ender-index (https://github.com/fatlard1993/ender-index)';

/** Modrinth allows 300 requests a minute; one every quarter second stays under it. */
const PAUSE = 250;

const PAGE = 100;

const get = async path => {
	const response = await fetchSteady(`${API}${path}`, { headers: { 'user-agent': AGENT, accept: 'application/json' } });

	if (!response.ok)
		throw Object.assign(new Error(`Modrinth ${response.status} for ${path}`), { status: response.status });

	return response.json();
};

const HOST_LINES = { 'github.com': '', 'codeberg.org': 'codeberg:', 'gitlab.com': 'gitlab:' };

/**
 * The repos.txt line a project's source link names, or undefined for a host the index does not crawl. A link into
 * the repository (a branch, a folder, GitLab's `/-/` pages) names the repository it is in.
 */
export const lineOf = url => {
	let parsed;

	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}

	const host = parsed.hostname.replace(/^www\./, '');

	if (!(host in HOST_LINES)) return undefined;

	const parts = parsed.pathname
		.split('/-/')[0]
		.split('/')
		.filter(Boolean)
		.map(part => part.replace(/\.git$/, ''));
	const path = host === 'gitlab.com' ? parts : parts.slice(0, 2);

	if (path.length < 2 || path.some(part => !/^[\w.-]+$/.test(part))) return undefined;

	return `${HOST_LINES[host]}${path.join('/')}`;
};

/**
 * Every Modrinth project of a type whose source is on a host the index crawls, by its slug and by its id, each to the
 * repos.txt line of its source, read page by page at the pace Modrinth allows. Takes about six minutes for its mods.
 */
export const modrinthSources = async ({ type = 'mod', pause = PAUSE, pages = Infinity } = {}) => {
	const sources = new Map();
	const ids = new Map();
	const facets = encodeURIComponent(JSON.stringify([[`project_type:${type}`]]));

	for (let page = 0, total = Infinity; page * PAGE < total && page < pages; ++page) {
		const found = await get(`/search?facets=${facets}&limit=${PAGE}&offset=${page * PAGE}&index=newest`);

		total = found.total_hits;
		await Bun.sleep(pause);

		const asked = found.hits.map(hit => hit.project_id);

		if (asked.length === 0) break;

		for (const project of await get(`/projects?ids=${encodeURIComponent(JSON.stringify(asked))}`)) {
			const line = project.source_url && lineOf(project.source_url);

			if (!line) continue;

			sources.set(project.slug, line);
			ids.set(project.id, line);
		}

		await Bun.sleep(pause);
	}

	return { sources, ids };
};
