import { HOSTS, fit, ownerOf } from 'ender-launcher/rank';
import { specFor } from 'ender-launcher/spec';

export const INDEX = 'https://raw.githubusercontent.com/fatlard1993/ender-index/main/data';

export const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export const REPOSITORY = 'https://github.com/fatlard1993/ender-index';

/** Where the index itself, and ender, are supported. */

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
/** An author as the address names one: a GitHub owner bare, any other host's as `host:owner`. */
const authorOf = value => {
	if (!value) return undefined;

	const [host, owner] = value.includes(':') ? value.split(':') : ['github', value];

	return HOSTS[host] && owner ? `${host}:${owner.toLowerCase()}` : undefined;
};

/** Where the page lists every mod the index gave a theme. */
export const tagPath = tag => `${writeQuery({ tag })}#/`;

/** Where the page lists every mod an entry's owner has in the index. */
export const authorPath = entry => `${writeQuery({ author: ownerOf(entry) })}#/`;

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
		support: params.get('support') === '1',
		author: authorOf(params.get('author')),
		tag: params.get('tag')?.trim().toLowerCase() || undefined,
	};
};

export const writeQuery = ({
	query,
	minecraft,
	loader,
	side,
	released,
	host,
	sort,
	avoid = [],
	support,
	author,
	tag,
}) => {
	const params = new URLSearchParams();

	if (query?.trim()) params.set('q', query.trim());
	if (minecraft) params.set('mc', minecraft);
	if (loader) params.set('loader', loader);
	if (side) params.set('side', side);
	if (released) params.set('released', released);
	if (host) params.set('host', host);
	if (sort && sort !== 'best') params.set('sort', sort);
	if (avoid.length > 0) params.set('avoid', avoid.join(','));
	if (support) params.set('support', '1');
	if (author) params.set('author', author.replace(/^github:/, ''));
	if (tag) params.set('tag', tag);

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
export const refine = (
	ranked,
	{ side, released, host, sort = 'best', avoid = [], support, author, tag },
	now = Date.now(),
) => {
	const kept = ranked.filter(
		({ entry }) =>
			(!side || (entry.environment ?? 'both') === side) &&
			(!released || time(entry.latest?.published) >= now - Number(released) * DAY) &&
			(!host || (entry.host ?? 'github') === host) &&
			(!support || (entry.funding?.length ?? 0) > 0) &&
			(!author || ownerOf(entry) === author) &&
			(!tag || (entry.tags ?? []).includes(tag)) &&
			!(entry.latest?.capabilities ?? []).some(capability => avoid.includes(capability)),
	);

	if (sort === 'name') return kept.toSorted((a, b) => titleOf(a.entry).localeCompare(titleOf(b.entry)));
	if (!(sort in ORDER)) return kept;

	return kept.toSorted((a, b) => ORDER[sort](b.entry) - ORDER[sort](a.entry));
};

const SITES = { github: 'https://github.com', codeberg: 'https://codeberg.org', gitlab: 'https://gitlab.com' };

export const repositoryUrl = entry => `${SITES[entry.host ?? 'github']}/${entry.repo}`;

/** Where a repository named as repos.txt names one, `owner/repo` on GitHub or `host:owner/repo`, can be read. */
export const lineUrl = line => {
	const [host, repo] = line.includes(':') ? line.split(':') : ['github', line];

	return repositoryUrl({ host, repo });
};

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
const version = text => text.trim().replace(/-$/, '');

/** Whether `upper` is the version just past every release of `lower`'s line: 26.2 after 26.1, 1.22 after 1.21.4. */
const nextLine = (lower, upper) => {
	const [a, b] = [lower.split('.'), upper.split('.')];

	return (
		b.length >= 2 &&
		a.slice(0, b.length - 1).join('.') === b.slice(0, -1).join('.') &&
		Number(b.at(-1)) === Number(a[b.length - 1]) + 1
	);
};

/** A version and every patch of it: 26.1.x for 26.1, while 1.21.1 has no patches of its own to stand for. */
const withPatches = lower => (lower.split('.').length >= 3 ? lower : `${lower}.x`);

const BOUND = /^(>=|>|<=|<)\s*([\w.+-]+)$/;

/**
 * A game version range as a player reads it, in the common shapes jars write them: Fabric's `>=1.21 <=1.21.4` and
 * `~1.21.1`, alternatives joined by `||`, and Forge's `[1.21.1,1.21.2)`. One in any other shape is shown as written.
 */
export const rangeLabel = range => {
	const text = (range ?? '').trim();

	if (text === '' || text === '*') return 'any version';
	if (text.includes('||')) return text.split('||').map(rangeLabel).join(', ');

	const maven = text.match(/^\[\s*([^,\]]+)\s*,\s*([^\])]*)\s*([\])])$/);

	if (maven) {
		const [, lower, upper, close] = maven;

		if (upper === '') return `${version(lower)} and later`;
		if (close === ']') return `${version(lower)} to ${version(upper)}`;

		return nextLine(version(lower), version(upper))
			? withPatches(version(lower))
			: `${version(lower)} up to ${version(upper)}`;
	}

	if (/^[=~^]?\s*[\d][\w.+-]*$/.test(text)) {
		const plain = version(text.replace(/^[=~^]\s*/, ''));

		return text.startsWith('^') || text.startsWith('~') ? `${plain}+` : plain;
	}

	const bounds = text.split(/\s+/).map(part => part.match(BOUND));

	if (bounds.some(bound => bound === null)) return text;

	const lower = bounds.find(([, operator]) => operator.startsWith('>'));
	const upper = bounds.find(([, operator]) => operator.startsWith('<'));

	if (lower && !upper) return `${version(lower[2])} and later`;
	if (upper && !lower) return `up to ${version(upper[2])}`;
	if (upper[1] === '<=') return `${version(lower[2])} to ${version(upper[2])}`;

	return nextLine(version(lower[2]), version(upper[2]))
		? withPatches(version(lower[2]))
		: `${version(lower[2])} up to ${version(upper[2])}`;
};

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

export { supportOf } from 'ender-launcher/support';

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

/** Images a readme shows that are not a picture of the mod: badges, buttons asking for support, chat invites. */
const NOT_A_SCREENSHOT =
	/shields\.io|badgen\.net|badge|forthebadge|\.svg($|\?)|ko-fi\.com|buymeacoffee|patreon|paypal|discord(app)?\.(com|gg)|bstats\.org|wakatime/i;

/** An image under this many pixels wide, by its own width attribute, is an icon or a button. */
const SMALLEST_SCREENSHOT = 100;

const IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img\b([^>]*)>/gi;

/** The pictures a readme shows of its mod, in its order, as addresses that load: at most `most` of them. */
export const screenshotsOf = (markdown, raw, most = 6) => {
	const shots = [];

	for (const [, markdownSource, tag] of markdown.replaceAll(/```[\s\S]*?```/g, '').matchAll(IMAGE)) {
		const source = markdownSource ?? tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
		const width = Number(tag?.match(/\bwidth\s*=\s*["']?(\d+)/i)?.[1] ?? Number.POSITIVE_INFINITY);
		const url = source && readmeUrl(source, raw);

		if (!url || !/^https?:/.test(url) || NOT_A_SCREENSHOT.test(url) || width < SMALLEST_SCREENSHOT) continue;
		if (!shots.includes(url)) shots.push(url);
		if (shots.length === most) break;
	}

	return shots;
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

export const PACK_SORTS = {
	stars: 'Most stars',
	indexed: 'Most mods in the index',
	pushed: 'Pushed most recently',
	mods: 'Most mods',
	name: 'Name',
};

export const PACK_FORMATS = { ender: 'ender pack', packwiz: 'packwiz', mrpack: '.mrpack' };

/** How much of a pack comes from where the index reads it. */
export const PACK_JARS = { indexed: 'Every mod in the index', found: 'Every jar found' };

export const readPackQuery = search => {
	const params = new URLSearchParams(search);

	return {
		query: params.get('q') ?? '',
		minecraft: params.get('mc') || undefined,
		loader: oneOf(params.get('loader'), LOADERS),
		format: oneOf(params.get('format'), PACK_FORMATS),
		jars: oneOf(params.get('jars'), PACK_JARS),
		sort: oneOf(params.get('sort'), PACK_SORTS) ?? 'stars',
	};
};

export const writePackQuery = ({ query, minecraft, loader, format, jars, sort }) => {
	const params = new URLSearchParams();

	if (query) params.set('q', query);
	if (minecraft) params.set('mc', minecraft);
	if (loader) params.set('loader', loader);
	if (format) params.set('format', format);
	if (jars) params.set('jars', jars);
	if (sort && sort !== 'stars') params.set('sort', sort);

	const written = params.toString();

	return written ? `?${written}` : '';
};

/**
 * Whether a pack fits what was chosen: its game version, its loader, its format, how much of it comes from where the
 * index reads it, and every word typed in its name or text.
 */
export const packFits = (pack, { query = '', minecraft, loader, format, jars }) => {
	const text = `${pack.name} ${pack.repo} ${pack.description ?? ''}`.toLowerCase();

	return (
		(!minecraft || pack.minecraft === minecraft) &&
		(!loader || pack.loader === loader) &&
		(!format || pack.formats.includes(format)) &&
		(jars !== 'indexed' || pack.matched.length === pack.count) &&
		(jars !== 'found' || !pack.missing) &&
		query
			.toLowerCase()
			.split(/\s+/)
			.filter(Boolean)
			.every(word => text.includes(word))
	);
};

const PACK_ORDERS = {
	stars: (a, b) => (b.stars ?? 0) - (a.stars ?? 0),
	indexed: (a, b) => b.matched.length - a.matched.length,
	pushed: (a, b) => (b.pushed ?? '').localeCompare(a.pushed ?? ''),
	mods: (a, b) => b.count - a.count,
	name: (a, b) => a.name.localeCompare(b.name),
};

export const sortPacks = (packs, sort = 'stars') =>
	packs.toSorted((a, b) => PACK_ORDERS[sort](a, b) || a.repo.localeCompare(b.repo));

/** Where a pack's own page is. */
export const packPath = pack => `#/pack/${pack.host ?? 'github'}/${pack.repo}`;
