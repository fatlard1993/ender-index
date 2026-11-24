/** Modrinth's projects, as its public API answers a page: by id or slug, a hundred to a request. */
const PROJECTS = 'https://api.modrinth.com/v2/projects';

/** What Modrinth answered, or is still answering, for each name asked: a project, or undefined where it has none. */
const known = new Map();

const asked = async url => {
	const response = await fetch(url);

	if (!response.ok) throw new Error(`Modrinth answered ${response.status}`);

	return response.json();
};

const shownOf = project => ({
	title: project.title,
	description: project.description,
	icon: project.icon_url || undefined,
	slug: project.slug,
});

/** One request for up to a hundred names, each name's answer kept; on a failure none is, so a later ask tries again. */
const askFor = (batch, ask) => {
	const answer = Promise.resolve()
		.then(() => ask(`${PROJECTS}?ids=${encodeURIComponent(JSON.stringify(batch))}`))
		.then(found => {
			const byName = new Map();

			for (const project of Array.isArray(found) ? found : []) {
				byName.set(String(project.slug).toLowerCase(), shownOf(project));
				byName.set(String(project.id).toLowerCase(), shownOf(project));
			}

			return byName;
		})
		.catch(() => {
			for (const name of batch) known.delete(name.toLowerCase());

			return new Map();
		});

	for (const name of batch)
		known.set(
			name.toLowerCase(),
			answer.then(byName => byName.get(name.toLowerCase())),
		);
};

/**
 * Each named Modrinth project's title, description, icon and slug, by the id or slug it was named by: asked of Modrinth
 * in as few requests as there are hundreds of them, shared with any ask still waiting on the same names, and kept for
 * the page's life. One Modrinth does not have, or could not be asked about, is missing from the answer, and its card
 * shows what the page already knew. The request is shared, so it is never stopped for one caller: each caller checks
 * its own signal before drawing what comes back.
 */
export const modrinthProjects = async (names, { ask = asked } = {}) => {
	const named = [...new Set(names.filter(Boolean))];
	const wanted = named.filter(name => !known.has(name.toLowerCase()));

	for (let at = 0; at < wanted.length; at += 100) askFor(wanted.slice(at, at + 100), ask);

	const answers = await Promise.all(named.map(name => known.get(name.toLowerCase())));

	return new Map(named.flatMap((name, at) => (answers[at] ? [[name, answers[at]]] : [])));
};
