import { satisfies } from 'ender-launcher/range';
import { authorOf, providerOf, requiredIds, sharing } from 'ender-launcher/rank';

import { donationsOf } from './funding';
import { informative, shorten } from './summary';
import { coalesce, tagsOf } from './tags';

const unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()];

/** A jar counts when it was read, is still published, and declares a mod: an installer or a standalone tool beside the source does not. */
const live = release =>
	release.assets.filter(asset => asset.error === undefined && asset.gone === undefined && asset.mods?.length > 0);

const usable = release => live(release).length > 0;

/** A repository with no release, known by a source that builds, as the release a build of it would be. */
const sourceRelease = ({ source }) =>
	source && {
		tag: source.commit.slice(0, 7),
		published: source.committed,
		prerelease: false,
		fromSource: true,
		assets: [{ name: 'source', mods: source.mods }],
	};

/**
 * The release a repository is listed by: its newest full release with a mod in it, or failing that its newest, or
 * failing that its source.
 */
export const latestRelease = record =>
	record.releases.find(release => !release.prerelease && usable(release)) ??
	record.releases.find(usable) ??
	sourceRelease(record);

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

/**
 * What says what a repository is when it does not: the description its jar declares, unless a template wrote it, or
 * else its readme's first paragraph, each with where it came from.
 */
const summaryOf = record => {
	if (record.description) return undefined;

	const declared = jars(record)
		.flatMap(asset => asset.mods ?? [])
		.map(mod => mod.description)
		.find(informative);

	if (declared) return { text: shorten(declared), from: 'jar' };

	return record.readmeSummary ? { text: record.readmeSummary, from: 'readme' } : undefined;
};

/**
 * How its author takes support: their FUNDING.yml first, then what the listed release's jars link to, then the
 * donation links of its Modrinth project, each once.
 */
const fundingOf = (record, assets, donations) => {
	const seen = new Set();
	const links = [
		...(record.funding ?? []).map(link => ({ ...link, from: 'repository' })),
		...assets.flatMap(asset => asset.funding ?? []).map(link => ({ ...link, from: 'jar' })),
		...donations.map(link => ({ ...link, from: 'modrinth' })),
	].filter(({ url }) => !seen.has(url) && seen.add(url));

	return links.length > 0 ? links : undefined;
};

/** One line of the search file: what a client needs to list a repository without fetching its record. */
export const summarize = (record, donations = []) => {
	const latest = latestRelease(record);
	const assets = latestAssets(record);

	return {
		repo: record.repo,
		host: record.host,
		description: record.description,
		summary: summaryOf(record),
		funding: fundingOf(record, assets, donations),
		stars: record.stars,
		archived: record.archived,
		license: record.license,
		pushed: record.pushed,
		downloads: downloadsOf(record),
		environment: environmentOf(assets.flatMap(asset => asset.mods ?? [])),
		icon: assets.find(asset => asset.icon)?.icon,
		replaced: record.releases.some(release => release.assets.some(asset => asset.replaced !== undefined)),
		...(latest?.fromSource ? { fromSource: true } : {}),
		targets: unique(
			[latest, ...record.releases]
				.filter(Boolean)
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
 * The repositories each one's mods need, suggest, break and conflict with, and how many need each, by the client's
 * own rule for which repository an id names on the mod's loader: a copy of a mod's id, or a port to another loader,
 * is not credited with the mods that name it.
 */
/** Where Modrinth says a mod id's source is, by the slug it is most often published under: the id itself. */
const sourceOf = (id, sources) => sources[id] ?? sources[id.replaceAll('_', '-')];

/** Each repository's newest version of each mod it holds, without build metadata, which ordering ignores. */
const versionsOf = records =>
	new Map(
		records.map(record => [
			`${record.host}:${record.repo}`,
			new Map(
				latestAssets(record)
					.flatMap(asset => asset.mods ?? [])
					.filter(mod => typeof mod.version === 'string')
					.map(mod => [mod.id, mod.version.replace(/\+.*$/, '')]),
			),
		]),
	);

/**
 * Whether a break or conflict holds against what is released now: one for every version always does; one for a range
 * only when the provider's newest version of that mod falls in it. A range that cannot be read against its version is
 * not counted, rather than warning of a clash nothing shows.
 */
export const holdsNow = (range, version) =>
	range === undefined || range === '*' || (version !== undefined && satisfies(version, range) === true);

const relate = (entries, records, sources = {}) => {
	const byRepo = new Map(entries.map(entry => [`${entry.host}:${entry.repo}`, entry]));
	const versions = versionsOf(records);

	for (const record of records) {
		const requiring = byRepo.get(`${record.host}:${record.repo}`);

		if (requiring === undefined) continue;

		const mods = latestAssets(record).flatMap(asset => asset.mods ?? []);
		const loaders = [...new Set(mods.map(mod => mod.loader))];
		const own = new Set(mods.flatMap(mod => [mod.id, ...(mod.provides ?? [])]));
		const resolved = ids =>
			new Set(
				[...new Set(ids)]
					.filter(id => !own.has(id))
					.flatMap(id => loaders.map(loader => providerOf(id, entries, requiring, { loader })))
					.filter(provider => provider !== undefined && provider !== requiring),
			);
		const named = resolved(requiredIds(mods));
		const clashing = field =>
			new Set(
				mods.flatMap(mod =>
					(mod[field] ?? [])
						.filter(id => !own.has(id))
						.flatMap(id =>
							loaders
								.map(loader => providerOf(id, entries, requiring, { loader }))
								.filter(provider => provider !== undefined && provider !== requiring)
								.filter(provider =>
									holdsNow(mod[`${field}Versions`]?.[id], versions.get(`${provider.host}:${provider.repo}`)?.get(id)),
								),
						),
				),
			);
		const missing = requiredIds(mods).filter(
			id => !loaders.some(loader => providerOf(id, entries, requiring, { loader }) !== undefined),
		);

		if (missing.length > 0)
			requiring.missing = missing.map(id => ({
				id,
				...(sourceOf(id, sources) ? { source: sourceOf(id, sources) } : {}),
			}));

		for (const provider of named) provider.usedBy = (provider.usedBy ?? 0) + 1;

		for (const [field, found] of [
			['needs', named],
			['suggests', resolved(mods.flatMap(mod => mod.suggests ?? []))],
			['breaks', clashing('breaks')],
			['conflicts', clashing('conflicts')],
		]) {
			if (found.size > 0) requiring[field] = [...found].map(provider => `${provider.host}:${provider.repo}`);
		}
	}

	return entries;
};

/** The mod ids whose own jars add blocks, items or entities: a relation to one says what a mod is about. */
const addingIds = records => {
	const ids = new Set();

	for (const record of records) {
		for (const asset of latestAssets(record)) {
			const names = asset.content?.names ?? {};

			if (['block', 'item', 'entity'].some(kind => names[kind]?.length > 0))
				for (const mod of asset.mods ?? []) ids.add(mod.id);
		}
	}

	return ids;
};

/** What each listed repository is about, and the themes the whole index comes down to. */
export const themesOf = records => {
	const listed = records.filter(record => record.gone === undefined);
	const adding = addingIds(listed);

	return coalesce(
		new Map(
			listed.map(record => {
				const assets = latestAssets(record);
				const mods = assets.flatMap(asset => asset.mods ?? []);

				return [
					`${record.host}:${record.repo}`,
					tagsOf({
						mods,
						contents: assets.map(asset => asset.content),
						texts: [
							record.description,
							record.readmeSummary,
							record.repo.split('/').at(-1).replaceAll(/[-_.]/g, ' '),
							...mods.flatMap(mod => [mod.name, mod.description]),
						],
						adds: id => adding.has(id),
					}),
				];
			}),
		),
	);
};

export const buildSearch = (records, themes = themesOf(records), sources = {}, donations = {}) => {
	const listed = records.filter(record => record.gone === undefined);
	const entries = listed
		.map(record => summarize(record, donationsOf(donations, record)))
		.filter(entry => entry.latest !== undefined)
		.sort((a, b) => a.repo.localeCompare(b.repo));

	for (const entry of entries) {
		entry.shares = sharing(entry, entries);
		entry.author = authorOf(entry, entries);

		const tags = themes.each.get(`${entry.host}:${entry.repo}`);

		if (tags?.length > 0) entry.tags = tags;
	}

	return relate(entries, listed, sources);
};
