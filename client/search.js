import { fit } from 'ender-launcher/rank';
import { specFor } from 'ender-launcher/spec';

export const INDEX = 'https://raw.githubusercontent.com/fatlard1993/ender-index/main/data';

export const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export const REPOSITORY = 'https://github.com/fatlard1993/ender-index';

export const LOADERS = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

/** What a page address asks for, so a search can be linked to. */
export const readQuery = search => {
	const params = new URLSearchParams(search);
	const loader = params.get('loader');

	return {
		query: params.get('q') ?? '',
		minecraft: params.get('mc') || undefined,
		loader: loader in LOADERS ? loader : undefined,
	};
};

export const writeQuery = ({ query, minecraft, loader }) => {
	const params = new URLSearchParams();

	if (query?.trim()) params.set('q', query.trim());
	if (minecraft) params.set('mc', minecraft);
	if (loader) params.set('loader', loader);

	const written = params.toString();

	return written ? `?${written}` : '';
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

const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README'];

/**
 * Where a repository's readme can be fetched from a page, tried in order, and where the files it links to are: raw
 * for an image, the host's own page for a link. Each of these answers a browser's cross-origin request.
 */
export const readmeSources = entry => {
	const { repo } = entry;

	if (entry.host === 'codeberg') {
		const raw = path => `https://codeberg.org/api/v1/repos/${repo}/raw/${path}`;

		return { candidates: README_NAMES.map(raw), raw, page: raw };
	}

	if (entry.host === 'gitlab') {
		return {
			candidates: README_NAMES.map(
				name =>
					`https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}/repository/files/${encodeURIComponent(name)}/raw?ref=HEAD`,
			),
			raw: path => `https://gitlab.com/${repo}/-/raw/HEAD/${path}`,
			page: path => `https://gitlab.com/${repo}/-/blob/HEAD/${path}`,
		};
	}

	const raw = path => `https://raw.githubusercontent.com/${repo}/HEAD/${path}`;

	return { candidates: README_NAMES.map(raw), raw, page: path => `https://github.com/${repo}/blob/HEAD/${path}` };
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

	return resolve(href.replace(/^\.?\/+/, ''));
};

/** Where a host lists releases with what each asset was downloaded; GitLab does not count them. */
export const releasesApi = entry =>
	({
		github: `https://api.github.com/repos/${entry.repo}/releases?per_page=100`,
		codeberg: `https://codeberg.org/api/v1/repos/${entry.repo}/releases?limit=50`,
	})[entry.host ?? 'github'];

/** Downloads by release tag and file name, as both hosts' release listings report them. */
export const downloadCounts = releases =>
	new Map(
		releases.flatMap(release =>
			(release.assets ?? []).map(asset => [`${release.tag_name}/${asset.name}`, asset.download_count ?? 0]),
		),
	);

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
