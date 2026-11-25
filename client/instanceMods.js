import { specFor } from 'ender-launcher/spec';

import { hrefOf } from './route';
import { aboutOf, modPath, pictureUrl, titleOf } from './search';

/** The key ender lists an entry under, in an instance's manifest, its lock and its chosen optional entries. */
export const keyOf = entry => `${entry.source}:${entry.id ?? entry.path ?? entry.url}`;

const INDEXED = new Set(['github', 'codeberg', 'gitlab']);
const NAMEABLE = new Set([...INDEXED, 'modrinth', 'curseforge']);
const HOST_PAGES = { github: 'https://github.com', codeberg: 'https://codeberg.org', gitlab: 'https://gitlab.com' };
const SOURCE_NAMES = {
	github: 'GitHub',
	codeberg: 'Codeberg',
	gitlab: 'GitLab',
	modrinth: 'Modrinth',
	curseforge: 'CurseForge',
	url: 'a link',
	local: 'this machine',
	gradle: 'a build on this machine',
};

/** Where CurseForge files a project named by its slug, by the folder it installs into. */
const CURSEFORGE_CLASSES = { mods: 'mc-mods', resourcepacks: 'texture-packs', shaderpacks: 'shaders' };

/**
 * Where to read more about something an instance or a pack installs: its page in the index when the index has it,
 * else its page where it is published. Undefined for a jar kept on this machine, which has no page. `folder` is the
 * one it installs into, which a CurseForge slug's page depends on.
 */
export const readMoreOf = (entry, indexed, folder = 'mods') => {
	if (indexed) return { href: hrefOf(modPath(indexed)), label: 'Read more' };
	if (entry.source === 'modrinth')
		return {
			href: `https://modrinth.com/project/${encodeURIComponent(entry.id)}`,
			label: 'Read more on Modrinth',
			away: true,
		};
	if (entry.source === 'curseforge')
		return {
			href: /^\d+$/.test(entry.id)
				? `https://www.curseforge.com/projects/${entry.id}`
				: `https://www.curseforge.com/minecraft/${CURSEFORGE_CLASSES[folder]}/${encodeURIComponent(entry.id)}`,
			label: 'Read more on CurseForge',
			away: true,
		};
	if (HOST_PAGES[entry.source])
		return {
			href: `${HOST_PAGES[entry.source]}/${entry.id}`,
			label: `Its repository on ${SOURCE_NAMES[entry.source]}`,
			away: true,
		};
	if (entry.source === 'url') return { href: entry.url, label: 'Its link', away: true };

	return undefined;
};

/** How an instance's page groups what it installs, in the order it shows them, each with what heads it. */
export const GROUPS = [
	{ id: 'pack', label: 'From its pack' },
	{ id: 'own', label: 'Added to it' },
	{
		id: 'optional',
		label: 'Optional, offered by its pack',
		note: 'Each is left out until turned on, and installed at the next sync once it is.',
	},
	{ id: 'assets', label: 'Resource and shader packs' },
	{ id: 'dependency', label: 'Brought in for what the others need' },
];

/** What ender named a jar it installed, less the version it puts after the name, which the facts line says. */
const nameOf = lock => {
	const name = lock?.name;

	return name && lock.version && name.endsWith(` ${lock.version}`) ? name.slice(0, -lock.version.length - 1) : name;
};

const groupOf = (entry, fromPack) => {
	if (entry.optional) return 'optional';

	return fromPack.has(keyOf(entry)) ? 'pack' : 'own';
};

/**
 * Everything an instance installs, as its page lists it: what each is and what it is about, out of the index's listing
 * where the index has it and the pack's own words for an optional entry; the version installed; where it comes from;
 * where to read more; whether an optional entry is on; and which group it is shown in. `details` is what
 * `ender info --json` says of the instance; the listing may be empty, and then names come from what is installed.
 * `published` is what Modrinth says of its projects (modrinthProjects.js), by the id or slug each is named by.
 */
export const instanceItems = (details, listing = [], published = new Map()) => {
	const byKey = new Map(listing.map(entry => [`${entry.host ?? 'github'}:${entry.repo}`, entry]));
	const installed = new Map((details.installed ?? []).map(found => [found.key, found]));
	const chosen = new Set(details.chosen ?? []);
	const fromPack = new Set(details.pack?.mods ?? []);
	const item = (entry, group, kind = 'mod', folder = 'mods') => {
		const key = keyOf(entry);
		const indexed = INDEXED.has(entry.source) ? byKey.get(key) : undefined;
		const project = entry.source === 'modrinth' ? published.get(entry.id) : undefined;
		const lock = installed.get(key);

		return {
			key,
			group,
			kind,
			title: indexed ? titleOf(indexed) : (project?.title ?? nameOf(lock) ?? entry.id ?? entry.path ?? entry.url),
			about: entry.description ?? (indexed ? aboutOf(indexed)?.text : project?.description),
			picture: indexed ? pictureUrl(indexed, 80) : project?.icon,
			version: entry.version ?? lock?.version,
			pinned: entry.version !== undefined,
			source: SOURCE_NAMES[entry.source] ?? entry.source,
			readMore: readMoreOf(entry, indexed, folder),
			...(NAMEABLE.has(entry.source) ? { spec: specFor(entry.source, entry.id) } : {}),
			...(entry.optional ? { optional: { on: chosen.has(key) } } : {}),
		};
	};
	const mods = (details.mods ?? []).map(entry => item(entry, groupOf(entry, fromPack)));
	const assets = [
		['resourcepacks', 'resource pack'],
		['shaderpacks', 'shader pack'],
	].flatMap(([field, kind]) =>
		(details[field] ?? []).map(entry => item(entry, entry.optional ? 'optional' : 'assets', kind, field)),
	);
	const declared = new Set([...mods, ...assets].map(({ key }) => key));
	const brought = (details.installed ?? [])
		.filter(found => !declared.has(found.key) && found.requested !== true)
		.map(found => item({ source: found.source, id: found.id }, 'dependency'));

	return [...mods, ...assets, ...brought];
};

/** The Modrinth projects an instance names, by the id or slug each is named by, to ask Modrinth about. */
export const modrinthNamed = details =>
	[
		...(details.mods ?? []),
		...(details.resourcepacks ?? []),
		...(details.shaderpacks ?? []),
		...(details.installed ?? []),
	]
		.filter(entry => entry.source === 'modrinth' && entry.id)
		.map(entry => entry.id);
