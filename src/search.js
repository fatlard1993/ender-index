const unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()];

const live = release => release.assets.filter(asset => asset.error === undefined && asset.gone === undefined);

const usable = release => live(release).length > 0;

/** One line of the search file: what a client needs to list a repository without fetching its record. */
export const summarize = record => {
	const latest =
		record.releases.find(release => !release.prerelease && usable(release)) ?? record.releases.find(usable);
	const assets = latest ? live(latest) : [];

	return {
		repo: record.repo,
		host: record.host,
		description: record.description,
		stars: record.stars,
		archived: record.archived,
		license: record.license,
		pushed: record.pushed,
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
		.map(summarize)
		.filter(entry => entry.latest !== undefined)
		.sort((a, b) => a.repo.localeCompare(b.repo));
