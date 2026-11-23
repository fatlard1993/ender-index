import { ESTABLISHED, authorOf, claimantsOf } from 'ender-launcher/rank';

/**
 * Each mod id the listing's repositories claim, with its claimants in the order ender weighs them, and each claimant
 * once, with what ender needs to choose among them: whether it or its author is established, and the game
 * versions and loaders it has releases for. It is what placing a mod's dependencies reads, without the listing it
 * is worked out from, which is several times its size. Worked out with ender's own rules, so the two agree.
 */
export const buildProviders = entries => {
	const ids = new Set(
		entries.flatMap(entry => [
			...(entry.latest?.mods ?? []).map(mod => mod.id).filter(Boolean),
			...(entry.latest?.provides ?? []),
		]),
	);
	const repositories = [];
	const at = new Map();
	const place = entry => {
		if (!at.has(entry)) {
			at.set(entry, repositories.length);
			repositories.push({
				host: entry.host ?? 'github',
				repo: entry.repo,
				// Standing rather than a count: the order is already worked out, and a count would change the file hourly
				...((entry.stars ?? 0) >= ESTABLISHED ? { established: true } : {}),
				...(authorOf(entry, entries) !== '' ? { author: true } : {}),
				targets: entry.targets ?? [],
			});
		}

		return at.get(entry);
	};
	const claimed = {};

	for (const id of [...ids].toSorted()) {
		const claimants = claimantsOf(id, entries);

		if (claimants.length > 0) claimed[id] = claimants.map(place);
	}

	return { repositories, ids: claimed };
};

/**
 * providers.json as written: a repository or a mod id to a line, so a crawl that changes a few of them changes a few
 * lines, and git keeps what changed rather than the file again.
 */
export const providersText = ({ repositories, ids }) =>
	`{"repositories":[\n${repositories.map(repository => JSON.stringify(repository)).join(',\n')}\n],"ids":{\n${Object.entries(
		ids,
	)
		.map(([id, at]) => `${JSON.stringify(id)}:${JSON.stringify(at)}`)
		.join(',\n')}\n}}\n`;
