import { providerOf, requiredIds } from 'ender-launcher/rank';

const unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()];

/** A jar counts when it was read, is still published, and declares a mod: an installer or a standalone tool beside the source does not. */
const live = release =>
	release.assets.filter(asset => asset.error === undefined && asset.gone === undefined && asset.mods?.length > 0);

const usable = release => live(release).length > 0;

/** The release a repository is listed by: its newest full release with a mod in it, or failing that its newest. */
export const latestRelease = record =>
	record.releases.find(release => !release.prerelease && usable(release)) ?? record.releases.find(usable);

/** The jars of that release worth reading, which a crawl also takes the icon from. */
export const latestAssets = record => {
	const latest = latestRelease(record);

	return latest ? live(latest) : [];
};

/** Every mod jar a record has read, still published or not, which a download count is summed over. */
const jars = record => record.releases.flatMap(release => release.assets.filter(asset => asset.mods?.length > 0));

/** What GitHub and Codeberg count for the jars read; GitLab counts nothing, and its records say nothing. */
const downloadsOf = record => {
	const counted = jars(record).filter(asset => asset.downloads !== undefined);

	return counted.length > 0 ? counted.reduce((sum, asset) => sum + asset.downloads, 0) : undefined;
};

/** The side a repository's mods run on: client or server when every one says so, both otherwise. */
const environmentOf = mods => {
	const sides = new Set(mods.map(mod => mod.environment ?? '*'));

	return sides.size === 1 && (sides.has('client') || sides.has('server')) ? [...sides][0] : 'both';
};

/** One line of the search file: what a client needs to list a repository without fetching its record. */
export const summarize = record => {
	const latest = latestRelease(record);
	const assets = latestAssets(record);

	return {
		repo: record.repo,
		host: record.host,
		description: record.description,
		stars: record.stars,
		archived: record.archived,
		license: record.license,
		pushed: record.pushed,
		downloads: downloadsOf(record),
		environment: environmentOf(assets.flatMap(asset => asset.mods ?? [])),
		icon: assets.find(asset => asset.icon)?.icon,
		replaced: record.releases.some(release => release.assets.some(asset => asset.replaced !== undefined)),
		targets: unique(
			record.releases
				.flatMap(release => live(release).flatMap(asset => asset.mods ?? []))
				.map(({ loader, minecraft }) => ({ loader, minecraft })),
			target => `${target.loader} ${target.minecraft}`,
		),
		latest: latest && {
			tag: latest.tag,
			published: latest.published,
			prerelease: latest.prerelease,
			mods: unique(
				assets
					.flatMap(asset => asset.mods ?? [])
					.map(({ loader, id, name, minecraft, environment }) => ({
						loader,
						id,
						name,
						minecraft,
						environment,
					})),
				mod => `${mod.loader}:${mod.id}`,
			),
			provides: [...new Set(assets.flatMap(asset => (asset.mods ?? []).flatMap(mod => mod.provides ?? [])))].sort(),
			capabilities: [...new Set(assets.flatMap(asset => Object.keys(asset.scan?.capabilities ?? {})))].sort(),
		},
	};
};

/**
 * How many listed repositories require a mod each one provides, by the client's own rule for which
 * repository a required id names on the requiring mod's loader: a copy of a mod's id, or a port to another
 * loader, is not credited with the mods that need it.
 */
const countDependents = (entries, records) => {
	const byRepo = new Map(entries.map(entry => [`${entry.host}:${entry.repo}`, entry]));

	for (const record of records) {
		const requiring = byRepo.get(`${record.host}:${record.repo}`);

		if (requiring === undefined) continue;

		const mods = latestAssets(record).flatMap(asset => asset.mods ?? []);
		const loaders = [...new Set(mods.map(mod => mod.loader))];
		const named = new Set(
			requiredIds(mods)
				.flatMap(id => loaders.map(loader => providerOf(id, entries, requiring, { loader })))
				.filter(provider => provider !== undefined && provider !== requiring),
		);

		for (const provider of named) provider.usedBy = (provider.usedBy ?? 0) + 1;
	}

	return entries;
};

export const buildSearch = records => {
	const listed = records.filter(record => record.gone === undefined);
	const entries = listed
		.map(summarize)
		.filter(entry => entry.latest !== undefined)
		.sort((a, b) => a.repo.localeCompare(b.repo));

	return countDependents(entries, listed);
};
