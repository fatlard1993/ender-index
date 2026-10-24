/** Gradle publishes these beside the real artifact; none of them is a mod. */
const NOT_A_MOD = /-(sources|javadoc|dev|api|slim|shadow)\.jar$/i;

/** Raised when what an inspection records changes, so assets already recorded are read again. */
export const INSPECTION = 2;

/** Releases looked at per crawl, newest first. Older ones stay recorded but are no longer watched. */
export const WINDOW = 5;

export const modAssets = release =>
	(release.assets ?? []).filter(asset => asset.name.endsWith('.jar') && !NOT_A_MOD.test(asset.name));

const about = (repo, host) => ({
	repo: repo.full_name,
	host,
	description: repo.description ?? undefined,
	stars: repo.stargazers_count,
	archived: repo.archived,
	license: repo.license?.spdx_id ?? undefined,
	created: repo.created_at,
	pushed: repo.pushed_at,
});

/**
 * Bring a repository's record up to date with what its releases now carry.
 *
 * `inspect` downloads one asset and returns its sha256, the mods it declares and its scan. An asset
 * is inspected once, when first seen, and again only when GitHub reports a different asset under the
 * same name: a re-upload. A re-upload with different bytes keeps the old hash in `replaced`, because
 * a release changed after people installed it is the thing most worth knowing about.
 */
export const updateRecord = async ({ record, repo, releases, now, inspect, host = 'github' }) => {
	const events = [];
	const known = new Map(structuredClone(record?.releases ?? []).map(release => [release.tag, release]));
	const watched = releases.filter(release => !release.draft && modAssets(release).length > 0).slice(0, WINDOW);

	for (const release of watched) {
		const recorded = known.get(release.tag_name) ?? {
			tag: release.tag_name,
			published: release.published_at,
			prerelease: release.prerelease,
			assets: [],
		};
		const current = modAssets(release);

		for (const asset of current) {
			const existing = recorded.assets.find(candidate => candidate.name === asset.name);

			if (existing?.id === asset.id && existing.inspection === INSPECTION) continue;

			let inspected;

			try {
				inspected = await inspect(asset);
			} catch (error) {
				inspected = { error: error.message };
			}

			const entry = {
				id: asset.id,
				name: asset.name,
				url: asset.browser_download_url,
				size: asset.size,
				inspection: INSPECTION,
				...inspected,
			};

			if (existing === undefined) {
				recorded.assets.push(entry);
				events.push({
					type: inspected.error ? 'failed' : 'new',
					repo: repo.full_name,
					tag: release.tag_name,
					asset: asset.name,
				});

				continue;
			}

			const changed = existing.sha256 !== entry.sha256;

			entry.replaced = [
				...(existing.replaced ?? []),
				...(changed ? [{ id: existing.id, sha256: existing.sha256, until: now }] : []),
			];

			if (entry.replaced.length === 0) delete entry.replaced;

			recorded.assets[recorded.assets.indexOf(existing)] = entry;

			if (changed) events.push({ type: 'swapped', repo: repo.full_name, tag: release.tag_name, asset: asset.name });
		}

		for (const asset of recorded.assets) {
			if (asset.gone === undefined && !current.some(candidate => candidate.name === asset.name)) {
				asset.gone = now;
				events.push({ type: 'gone', repo: repo.full_name, tag: release.tag_name, asset: asset.name });
			}
		}

		known.set(release.tag_name, recorded);
	}

	if (known.size === 0) return { record: undefined, events };

	return {
		record: {
			...about(repo, host),
			releases: [...known.values()].sort((a, b) => Date.parse(b.published) - Date.parse(a.published)),
		},
		events,
	};
};
