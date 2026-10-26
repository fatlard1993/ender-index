import { HOSTS, fit } from 'ender-launcher/rank';
import { specFor } from 'ender-launcher/spec';

export const INDEX = 'https://raw.githubusercontent.com/fatlard1993/ender-index/main/data';

export const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export const REPOSITORY = 'https://github.com/fatlard1993/ender-index';

export const LOADERS = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

export const SIDES = { client: 'Client only', server: 'Server only', both: 'Client and server' };

export const RELEASED = { 90: 'Released in 3 months', 365: 'Released in a year', 730: 'Released in 2 years' };

export const SORTS = {
	best: 'Best match',
	stars: 'Most stars',
	downloads: 'Most downloads',
	used: 'Most used',
	released: 'Newest release',
	pushed: 'Recently pushed',
	name: 'Name',
};

const REACHABLE = ['network', 'exec', 'native', 'classloading', 'unsafe'];

const oneOf = (value, choices) => (value in choices ? value : undefined);

/** What a page address asks for, so a search can be linked to. */
export const readQuery = search => {
	const params = new URLSearchParams(search);

	return {
		query: params.get('q') ?? '',
		minecraft: params.get('mc') || undefined,
		loader: oneOf(params.get('loader'), LOADERS),
		side: oneOf(params.get('side'), SIDES),
		released: oneOf(params.get('released'), RELEASED),
		host: oneOf(params.get('host'), HOSTS),
		sort: oneOf(params.get('sort'), SORTS) ?? 'best',
		avoid: (params.get('avoid') ?? '').split(',').filter(capability => REACHABLE.includes(capability)),
	};
};

export const writeQuery = ({ query, minecraft, loader, side, released, host, sort, avoid = [] }) => {
	const params = new URLSearchParams();

	if (query?.trim()) params.set('q', query.trim());
	if (minecraft) params.set('mc', minecraft);
	if (loader) params.set('loader', loader);
	if (side) params.set('side', side);
	if (released) params.set('released', released);
	if (host) params.set('host', host);
	if (sort && sort !== 'best') params.set('sort', sort);
	if (avoid.length > 0) params.set('avoid', avoid.join(','));

	const written = params.toString();

	return written ? `?${written}` : '';
};

const DAY = 24 * 60 * 60 * 1000;

const time = date => (date ? Date.parse(date) : 0);

const ORDER = {
	stars: entry => entry.stars ?? 0,
	downloads: entry => entry.downloads ?? 0,
	used: entry => entry.usedBy ?? 0,
	released: entry => time(entry.latest?.published),
	pushed: entry => time(entry.pushed),
};

/**
 * Ranked results narrowed by the filters the ranking does not know, and put in the order asked for.
 * Ties keep the ranking's order, so the best match among equals comes first.
 */
export const refine = (ranked, { side, released, host, sort = 'best', avoid = [] }, now = Date.now()) => {
	const kept = ranked.filter(
		({ entry }) =>
			(!side || (entry.environment ?? 'both') === side) &&
			(!released || time(entry.latest?.published) >= now - Number(released) * DAY) &&
			(!host || (entry.host ?? 'github') === host) &&
			!(entry.latest?.capabilities ?? []).some(capability => avoid.includes(capability)),
	);

	if (sort === 'name') return kept.toSorted((a, b) => titleOf(a.entry).localeCompare(titleOf(b.entry)));
	if (!(sort in ORDER)) return kept;

	return kept.toSorted((a, b) => ORDER[sort](b.entry) - ORDER[sort](a.entry));
};

const SITES = { github: 'https://github.com', codeberg: 'https://codeberg.org', gitlab: 'https://gitlab.com' };

export const repositoryUrl = entry => `${SITES[entry.host ?? 'github']}/${entry.repo}`;

/** GitLab puts its releases behind the `/-/` it keeps its own pages under. */
export const releasesUrl = entry => `${repositoryUrl(entry)}/${entry.host === 'gitlab' ? '-/' : ''}releases`;

export const releaseUrl = entry =>
	`${releasesUrl(entry)}/${entry.host === 'gitlab' ? '' : 'tag/'}${encodeURIComponent(entry.latest.tag)}`;

export const installCommand = entry => `ender add ${specFor(entry.host ?? 'github', entry.repo)}`;

/** Release ids from Mojang's manifest, newest first; snapshots are left out, as mods rarely target them. */
export const releasedVersions = manifest =>
	(manifest?.versions ?? []).filter(version => version.type === 'release').map(version => version.id);

/**
 * The game versions to name on an entry: the one searched for first, then the newest its jars declare,
 * and how many more they fit.
 */
export const fittingVersions = (entry, versions, { minecraft, shown = 3 } = {}) => {
	const fitting = versions.filter(version => fit(entry.targets, { minecraft: version }) === 2);
	const named =
		minecraft && fitting.includes(minecraft) ? [minecraft, ...fitting.filter(v => v !== minecraft)] : fitting;

	return { versions: named.slice(0, shown), more: Math.max(0, named.length - shown) };
};

const SUMMARY_SOURCES = { jar: 'from its jar', readme: 'from its readme' };

/** What a repository says it is, or the crawl's summary of it with where that came from. */
export const aboutOf = entry => {
	if (entry.description) return { text: entry.description };
	if (entry.summary) return { text: entry.summary.text, from: SUMMARY_SOURCES[entry.summary.from] };

	return undefined;
};

const PLATFORM_NAMES = {
	github: 'GitHub Sponsors',
	patreon: 'Patreon',
	open_collective: 'Open Collective',
	ko_fi: 'Ko-fi',
	liberapay: 'Liberapay',
	buy_me_a_coffee: 'Buy Me a Coffee',
	polar: 'Polar',
	thanks_dev: 'thanks.dev',
	issuehunt: 'IssueHunt',
	tidelift: 'Tidelift',
	community_bridge: 'LFX Crowdfunding',
	lfx_crowdfunding: 'LFX Crowdfunding',
};

/** How an author takes support, each named for where it leads: a custom link by its site, which is the author's say. */
export const supportOf = entry =>
	(entry.funding ?? []).map(({ platform, url }) => ({
		url,
		label: PLATFORM_NAMES[platform] ?? new URL(url).hostname.replace(/^www\./, ''),
	}));

export const titleOf = entry =>
	[...new Set((entry.latest?.mods ?? []).map(mod => mod.name ?? mod.id))].join(', ') || entry.repo;

export const loadersOf = entry =>
	[...new Set((entry.latest?.mods ?? []).map(mod => mod.loader))].map(loader => LOADERS[loader] ?? loader);

/** What a capability means, said as what the code can do: a finding, not a verdict. */
export const CAPABILITIES = {
	exec: 'Its code can start other programs',
	classloading: 'Its code can define classes while running, which a scan of the jar cannot read',
	native: 'Its code can load native libraries',
	network: 'Its code can open network connections',
	unsafe: "Its code uses Unsafe, which reaches memory past Java's checks",
};

/** A repository's page here. A GitLab owner can be a nested group, so it is one encoded segment. */
export const modPath = entry => {
	const split = entry.repo.lastIndexOf('/');

	return `/mod/${entry.host ?? 'github'}/${encodeURIComponent(entry.repo.slice(0, split))}/${encodeURIComponent(entry.repo.slice(split + 1))}`;
};

const RECORD_DIRECTORIES = { github: '', codeberg: 'codeberg.org/', gitlab: 'gitlab.com/' };

export const recordUrl = (entry, base = INDEX) =>
	`${base}/mods/${RECORD_DIRECTORIES[entry.host ?? 'github']}${entry.repo}.json`;

/** GitHub serves any account's picture by name; the other hosts need a request to find theirs. */
export const avatarUrl = (entry, size = 96) =>
	(entry.host ?? 'github') === 'github' ? `https://github.com/${entry.repo.split('/')[0]}.png?size=${size}` : undefined;

/** The icon its jar declares, kept by the crawl, and failing that its owner's picture. */
export const pictureUrl = (entry, size = 96, base = INDEX) =>
	entry.icon ? `${base}/icons/${entry.icon}` : avatarUrl(entry, size);

const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README'];

/** How each host's readme and the files beside it are reached from a page on another origin. */
const README_HOSTS = {
	github: repo => ({
		fetch: path => `https://raw.githubusercontent.com/${repo}/HEAD/${path}`,
		raw: path => `https://raw.githubusercontent.com/${repo}/HEAD/${path}`,
		page: path => `https://github.com/${repo}/blob/HEAD/${path}`,
	}),
	codeberg: repo => {
		const raw = path => `https://codeberg.org/api/v1/repos/${repo}/raw/${path}`;

		return { fetch: raw, raw, page: raw };
	},
	gitlab: repo => ({
		fetch: path =>
			`https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}/repository/files/${encodeURIComponent(path)}/raw?ref=HEAD`,
		raw: path => `https://gitlab.com/${repo}/-/raw/HEAD/${path}`,
		page: path => `https://gitlab.com/${repo}/-/blob/HEAD/${path}`,
	}),
};

/** The readme paths to try: the one the crawl found, none when it found none, and the usual names for a record from before. */
const readmeCandidates = readme => {
	if (readme === null) return [];

	return readme === undefined ? README_NAMES : [readme];
};

/**
 * Where a repository's readme can be fetched from a page, tried in order, and where the files it links to are: raw
 * for an image, the host's own page for a link, from the readme's own directory unless the link starts at the root.
 */
export const readmeSources = (entry, readme) => {
	const hosted = README_HOSTS[entry.host ?? 'github'](entry.repo);
	const directory = readme?.includes('/') ? readme.slice(0, readme.lastIndexOf('/') + 1) : '';
	const from =
		resolve =>
		(path, { root } = {}) =>
			resolve(root ? path : `${directory}${path}`);

	return { candidates: readmeCandidates(readme).map(hosted.fetch), raw: from(hosted.raw), page: from(hosted.page) };
};

/**
 * A readme's own link, made absolute. A relative one is from the repository's root, which is where the readme is, and
 * so is one starting with a slash; an image GitHub shows from a blob page is fetched from raw instead.
 */
export const readmeUrl = (href, resolve) => {
	if (!href || href.startsWith('#')) return href;

	if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) {
		return href.replace(
			/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|raw)\//,
			'https://raw.githubusercontent.com/$1/',
		);
	}

	return resolve(href.replace(/^\.?\/+/, ''), { root: href.startsWith('/') });
};

/** Where a host lists releases with what each asset was downloaded; GitLab does not count them. */
export const collectionKey = entry => `${entry.host ?? 'github'}:${entry.repo}`;

/** One line that adds every collected mod; ender resolves each and what they require together. */
export const installAllCommand = (entries, { instance } = {}) =>
	[
		'ender add',
		...entries.map(entry => specFor(entry.host ?? 'github', entry.repo)),
		...(instance ? ['--instance', instance] : []),
	].join(' ');

/** Bytes as a reader says them. */
export const fileSize = bytes =>
	bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
