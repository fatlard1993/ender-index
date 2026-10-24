const usable = release => release.assets.some(asset => asset.error === undefined && asset.gone === undefined);

const unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()];

/** One line of the search file: what a client needs to list a repository without fetching its record. */
export const summarize = record => {
	const latest =
		record.releases.find(release => !release.prerelease && usable(release)) ?? record.releases.find(usable);
	const assets = latest?.assets.filter(asset => asset.error === undefined && asset.gone === undefined) ?? [];

	return {
		repo: record.repo,
		host: record.host,
		description: record.description,
		stars: record.stars,
		archived: record.archived,
		license: record.license,
		pushed: record.pushed,
		replaced: record.releases.some(release => release.assets.some(asset => asset.replaced !== undefined)),
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
			capabilities: [...new Set(assets.flatMap(asset => Object.keys(asset.scan?.capabilities ?? {})))].sort(),
		},
	};
};

export const buildSearch = records =>
	records
		.map(summarize)
		.filter(entry => entry.latest !== undefined)
		.sort((a, b) => a.repo.localeCompare(b.repo));
