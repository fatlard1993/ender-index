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
