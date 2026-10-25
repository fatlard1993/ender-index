/** Gradle publishes these beside the real artifact; none of them is a mod. */
const NOT_A_MOD = /-(sources|javadoc|dev|api|slim|shadow)\.jar$/i;

/** Raised when what an inspection records changes, so assets already recorded are read again. */
export const INSPECTION = 2;

/** Releases looked at per crawl, newest first. Older ones stay recorded but are no longer watched. */
export const WINDOW = 5;

/** Releases a host answers per page, and the pages of history read once per repository. */
export const PAGE = 30;
export const PAGES = 10;

/** Raised when more history should be read, so repositories already recorded have theirs read again. */
export const HISTORY = 1;

/** Game versions besides the window whose newest release is also looked at, newest first. */
export const VERSION_LIMIT = 24;

/** The game versions a release's tag or jar names mention, among those given. */
const versionsNamed = (release, gameVersions) =>
	new Set(
		[release.tag_name, ...modAssets(release).map(asset => asset.name)]
			.flatMap(name => name.split(/[^\d.]+/))
			.map(token => token.replace(/^\.+|\.+$/g, ''))
			.filter(token => gameVersions.has(token)),
	);

/**
 * The releases worth downloading: the newest few, and the newest naming each game version. A project
 * releasing per game version pushes its builds for older versions off the first page within weeks,
 * and those are what most instances run. The name only chooses what is downloaded; what a jar
 * supports is still read from the jar.
 */
export const watchedReleases = (releases, gameVersions = new Set()) => {
	const candidates = releases.filter(release => !release.draft && modAssets(release).length > 0);
	const watched = new Set(candidates.slice(0, WINDOW));
	const covered = new Set();

	for (const release of candidates) {
		const named = [...versionsNamed(release, gameVersions)].filter(version => !covered.has(version));

		if (named.length === 0 || covered.size >= VERSION_LIMIT) continue;

		for (const version of named) covered.add(version);
		watched.add(release);
	}

	return candidates.filter(release => watched.has(release));
};

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
 * is inspected once, when first seen, and again only when the host reports a different asset under the
 * same name, or the same asset leading somewhere else: a GitLab link keeps its id when its URL is edited.
 * Different bytes from either keep the old hash in `replaced`, because a release changed after people
 * installed it is the thing most worth knowing about.
 */
export const updateRecord = async ({ record, repo, releases, now, inspect, host = 'github', gameVersions }) => {
	const events = [];
	const known = new Map(structuredClone(record?.releases ?? []).map(release => [release.tag, release]));
	const watched = watchedReleases(releases, gameVersions);

	for (const release of watched) {
		const recorded = known.get(release.tag_name) ?? {
			tag: release.tag_name,
			published: release.published_at,
			prerelease: release.prerelease,
			assets: [],
		};
		const current = modAssets(release);
		const currentIds = new Set(current.map(asset => asset.id));

		for (const asset of current) {
			// A GitHub re-upload keeps the name under a new id. GitLab allows several links to files of one
			// name, so a name alone is matched only to an asset that has left the release.
			const existing =
				recorded.assets.find(candidate => candidate.id === asset.id) ??
				recorded.assets.find(candidate => candidate.name === asset.name && !currentIds.has(candidate.id));

			if (
				existing?.id === asset.id &&
				existing.url === asset.browser_download_url &&
				existing.inspection === INSPECTION &&
				existing.metadataError === undefined
			)
				continue;

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

			const changed = existing.sha256 !== undefined && existing.sha256 !== entry.sha256;

			entry.replaced = [
				...(existing.replaced ?? []),
				...(changed ? [{ id: existing.id, sha256: existing.sha256, until: now }] : []),
			];

			if (entry.replaced.length === 0) delete entry.replaced;

			recorded.assets[recorded.assets.indexOf(existing)] = entry;

			if (changed) events.push({ type: 'swapped', repo: repo.full_name, tag: release.tag_name, asset: asset.name });
		}

		for (const asset of recorded.assets) {
			if (asset.gone === undefined && !currentIds.has(asset.id)) {
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

/**
 * A repository its host answers 404 for was deleted or made private. Its record is kept, marked, since a
 * private repository can come back, and that is news only the first time it is seen.
 */
export const vanish = ({ record, name, now }) =>
	record === undefined || record.gone !== undefined
		? { record, events: [] }
		: { record: { ...record, gone: now }, events: [{ type: 'vanished', repo: name }] };
