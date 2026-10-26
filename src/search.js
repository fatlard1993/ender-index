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

export const buildSearch = records =>
	records
		.filter(record => record.gone === undefined)
		.map(summarize)
		.filter(entry => entry.latest !== undefined)
		.sort((a, b) => a.repo.localeCompare(b.repo));
