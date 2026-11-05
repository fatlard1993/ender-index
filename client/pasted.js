import { specFor } from 'ender-launcher/spec';

const INDEX_HOSTS = new Set(['github', 'codeberg', 'gitlab']);

const SPEC = /^(gh|cb|gl|mr|cf):[\w-][\w.-]*(\/[\w-][\w.-]*)*$/;

/** The flags of ender add, import and new that take a value, which is not a mod or a pack. */
const TAKES_VALUE = new Set(['--instance', '-i', '--minecraft', '-m', '--loader', '-l', '--name']);

const COMMANDS = { add: 'mod', import: 'pack', new: 'mod' };

/** A page of the index, as a mod or a pack, from its address or a link shared as #/mod/... */
const indexPage = url => {
	const route = `${url.pathname}${url.hash.replace(/^#/, '')}`;
	const found = route.match(/\/(mod|pack)\/([a-z]+)\/(.+?)\/?$/);

	if (!found || !INDEX_HOSTS.has(found[2]) || found[3].split('/').length < 2) return undefined;

	return { kind: found[1], spec: specFor(found[2], found[3].split('/').map(decodeURIComponent).join('/')) };
};

const REPOSITORY_HOSTS = { 'github.com': 'github', 'codeberg.org': 'codeberg', 'gitlab.com': 'gitlab' };

/** A link elsewhere: a repository, a Modrinth or CurseForge project, or a gist, which is a pack. */
const linkElsewhere = url => {
	const parts = url.pathname.split('/').filter(Boolean);

	if (url.hostname === 'gist.github.com') return { kind: 'pack', spec: url.href };
	if (url.hostname === 'modrinth.com' && ['mod', 'modpack'].includes(parts[0]) && parts[1]) {
		return parts[0] === 'mod' ? { kind: 'mod', spec: `mr:${parts[1]}` } : { kind: 'pack', spec: url.href };
	}
	if (url.hostname.endsWith('curseforge.com') && parts[0] === 'minecraft' && parts[1] === 'mc-mods' && parts[2]) {
		return { kind: 'mod', spec: `cf:${parts[2]}` };
	}

	const host = REPOSITORY_HOSTS[url.hostname];

	if (host && parts.length >= 2) {
		const path =
			host === 'gitlab'
				? parts.slice(0, parts.indexOf('-') === -1 ? undefined : parts.indexOf('-'))
				: parts.slice(0, 2);

		return { kind: 'either', spec: specFor(host, path.join('/').replace(/\.git$/, '')) };
	}

	return { kind: 'pack', spec: url.href };
};

const wordOf = word => {
	if (SPEC.test(word)) return { kind: 'either', spec: word };
	if (/^gist:([\w-]+\/)?\w+$/.test(word)) return { kind: 'pack', spec: word };

	try {
		const url = new URL(word);

		if (!['http:', 'https:'].includes(url.protocol)) return undefined;

		return indexPage(url) ?? linkElsewhere(url);
	} catch {
		return undefined;
	}
};

/**
 * The mods and packs a pasted text names: index pages, ender add and ender import lines copied from the index, links to
 * repositories and projects, and specs. A bare spec or repository link is a mod or a pack as the line's command says,
 * or as `bare` says where none does. Anything else is kept as `unread`, for the page to say so rather than drop it.
 */
export const readPasted = (text, { bare = 'mod' } = {}) => {
	const read = { mods: [], packs: [], unread: [] };

	for (const line of text.split('\n')) {
		const words = line.trim().split(/\s+/).filter(Boolean);
		let kind = bare;
		let naming = false;

		for (let index = 0; index < words.length; ++index) {
			const word = words[index];

			if (word === 'ender') continue;
			if (COMMANDS[word] && index <= 1) {
				kind = COMMANDS[word];
				naming = word === 'new';

				continue;
			}
			if (TAKES_VALUE.has(word)) {
				++index;

				continue;
			}
			if (word.startsWith('-')) continue;
			if (naming) {
				naming = false;

				continue;
			}

			const named = wordOf(word);

			if (!named) read.unread.push(word);
			else if ((named.kind === 'either' ? kind : named.kind) === 'pack') read.packs.push(named.spec);
			else read.mods.push(named.spec);
		}
	}

	return { mods: [...new Set(read.mods)], packs: [...new Set(read.packs)], unread: read.unread };
};

/** What the pack field holds, said back when it is not one pack: mods go to the list, several packs one at a time. */
export const packOrMods = text => {
	const { mods, packs, unread } = readPasted(text, { bare: 'pack' });

	if (packs.length === 1 && mods.length === 0) return { pack: packs[0] };
	if (packs.length > 1) return { said: `That names ${packs.length} packs; import one at a time` };
	if (mods.length > 0 && packs.length === 0) {
		return {
			mods,
			said: `${mods.length === 1 ? 'That is a mod' : 'Those are mods'}, not a pack: ${mods.length === 1 ? 'it is' : 'they are'} in the list below; name the instance and press Make it`,
		};
	}
	if (mods.length > 0) return { said: 'That names a pack and mods; import the pack, then add the mods to it' };

	return { said: unread.length > 0 ? `Not a pack ender can read: ${unread.join(' ')}` : 'Paste a pack first' };
};
