import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { readEntryJson } from 'ender-launcher/archive';
import { ENDER_PACK, parseEnderPack } from 'ender-launcher/enderPack';
import { packwizMetafiles, packwizPack } from 'ender-launcher/packwiz';

import { fetchSteady, limitedBy } from './fetch';
import * as github from './github';
import { lineOf, projectsByHash, projectsById } from './modrinth';
import { rawUrl } from './raw';

/** The largest .mrpack downloaded whole, when its host will not serve it by ranges. */
export const MRPACK_LIMIT = 100 * 1024 * 1024;

const MRPACK_INDEX = 'modrinth.index.json';

const METAFILES_AT_ONCE = 8;

/**
 * A file at the head of a repository's default branch, or undefined when it has none. GitHub's raw files answer 429 to
 * a burst of them, which the crawl waits out or leaves for next time like any rate limit, not a failure of the pack.
 */
export const fileAt = async (name, path, { fetching = fetchSteady } = {}) => {
	const response = await fetching(rawUrl('github', name, path));

	if (response.status === 404) return undefined;
	if (response.status === 429) throw limitedBy('GitHub', response);
	if (!response.ok) throw new Error(`${path} answered ${response.status}`);

	return response.text();
};

/** The mods of a packwiz pack, each as its .pw.toml names it: by name, file, link and the site it is updated from. */
const packwizMods = async (name, index) => {
	const listed = packwizMetafiles(index);
	const metafiles = listed.length > 0 ? listed : (await github.filesOf(name)).filter(path => path.endsWith('.pw.toml'));
	const sources = new Array(metafiles.length);
	let next = 0;

	// Several at a time: a pack names a file per mod, two hundred is common, and each is its own request
	await Promise.all(
		Array.from({ length: Math.min(METAFILES_AT_ONCE, metafiles.length) }, async () => {
			while (next < metafiles.length) {
				const at = next++;

				sources[at] = await fileAt(name, metafiles[at]);
			}
		}),
	);

	const mods = [];

	for (const source of sources) {
		if (source === undefined) continue;

		const mod = Bun.TOML.parse(source);

		mods.push({
			name: mod.name,
			file: mod.filename,
			...(mod.download?.url ? { url: mod.download.url } : {}),
			...(mod.side && mod.side !== 'both' ? { side: mod.side } : {}),
			...(mod.update?.modrinth?.['mod-id'] ? { modrinth: mod.update.modrinth['mod-id'] } : {}),
			...(mod.update?.curseforge?.['project-id'] ? { curseforge: String(mod.update.curseforge['project-id']) } : {}),
			...(mod.download?.['hash-format'] === 'sha1' && mod.download.hash
				? { sha1: mod.download.hash.toLowerCase() }
				: {}),
		});
	}

	return mods;
};

/** The newest release attaching a .mrpack, and that file. */
const mrpackRelease = releases => {
	for (const release of releases) {
		if (release.draft) continue;

		const asset = release.assets.find(candidate => candidate.name.endsWith('.mrpack'));

		if (asset) return { release, asset };
	}

	return undefined;
};

/** A .mrpack's index: its name and version, the game and loader it is for, and the files it fetches. */
/** Bytes from..to of a file, by an HTTP range: the host answers 206 with just those, or the read fails. */
const bytesOf = async (url, from, to) => {
	const response = await fetchSteady(url, { headers: { range: `bytes=${from}-${to}` } });

	if (response.status !== 206) throw new Error(`answered ${response.status} to a range`);

	return new Uint8Array(await response.arrayBuffer());
};

/** A zip's tail holds its directory; this much of it is read first, enough for any pack's. */
const ZIP_TAIL = 256 * 1024;

/**
 * One file of a zip on a host that serves byte ranges, read without downloading the rest: the directory at its end,
 * then that entry alone. A pack's index is a few hundred kilobytes in an archive of up to a gigabyte of overrides.
 */
export const zipEntryByRanges = async (url, size, name, { read = bytesOf } = {}) => {
	const start = Math.max(0, size - ZIP_TAIL);
	const tail = await read(url, start, size - 1);
	const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
	let end = -1;

	for (let at = tail.length - 22; at >= 0; at--) {
		if (view.getUint32(at, true) === 0x06054b50) {
			end = at;
			break;
		}
	}

	if (end < 0) throw new Error('no zip directory at its end');

	const entries = view.getUint16(end + 10, true);
	const directorySize = view.getUint32(end + 12, true);
	const directoryAt = view.getUint32(end + 16, true);

	if (directoryAt === 0xffffffff) throw new Error('a zip64 archive');

	const directory =
		directoryAt >= start
			? tail.subarray(directoryAt - start, directoryAt - start + directorySize)
			: await read(url, directoryAt, directoryAt + directorySize - 1);
	const listing = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
	const decoder = new TextDecoder();

	for (let at = 0, seen = 0; seen < entries; seen++) {
		const method = listing.getUint16(at + 10, true);
		const compressed = listing.getUint32(at + 20, true);
		const nameLength = listing.getUint16(at + 28, true);
		const extraLength = listing.getUint16(at + 30, true);
		const commentLength = listing.getUint16(at + 32, true);
		const localAt = listing.getUint32(at + 42, true);
		const entryName = decoder.decode(directory.subarray(at + 46, at + 46 + nameLength));

		if (entryName === name) {
			const header = await read(url, localAt, localAt + 29);
			const local = new DataView(header.buffer, header.byteOffset, header.byteLength);
			const dataAt = localAt + 30 + local.getUint16(26, true) + local.getUint16(28, true);
			const data = compressed > 0 ? await read(url, dataAt, dataAt + compressed - 1) : new Uint8Array();

			if (method === 0) return data;
			if (method === 8) return Bun.inflateSync(data);

			throw new Error(`${name} is compressed by method ${method}`);
		}

		at += 46 + nameLength + extraLength + commentLength;
	}

	throw new Error(`no ${name} in it`);
};

const readMrpack = async (asset, scratch) => {
	try {
		return JSON.parse(
			new TextDecoder().decode(await zipEntryByRanges(asset.browser_download_url, asset.size, MRPACK_INDEX)),
		);
	} catch (error) {
		if (asset.size > MRPACK_LIMIT) {
			throw new Error(
				`${asset.name} could not be read by ranges (${error.message}), and at ${asset.size} bytes is past the ${MRPACK_LIMIT} downloaded whole`,
			);
		}
	}

	await mkdir(scratch, { recursive: true });

	const path = join(scratch, `${asset.id}.mrpack`);

	try {
		const response = await fetchSteady(asset.browser_download_url);

		if (!response.ok) throw new Error(`${asset.name} answered ${response.status}`);

		await Bun.write(path, response);

		return await readEntryJson(path, MRPACK_INDEX);
	} finally {
		await rm(path, { force: true });
	}
};

const MRPACK_LOADERS = { 'fabric-loader': 'fabric', 'quilt-loader': 'quilt', forge: 'forge', neoforge: 'neoforge' };

/** Where Modrinth serves a project's files, by the project's id. */
const MODRINTH_FILE = /^https:\/\/cdn\.modrinth\.com\/data\/([^/]+)\//;

/**
 * What Modrinth knows of a pack's mods, written onto each: the project a file is, by its link or else by its SHA-1, as
 * for a CurseForge mod Modrinth also has, and that project's name and source. Modrinth not answering leaves them as
 * the pack named them.
 */
export const describeMods = async (mods, { projectsByHash: byHash, projectsById: byId }) => {
	try {
		for (const mod of mods) mod.modrinth ??= mod.url?.match(MODRINTH_FILE)?.[1];

		const unnamed = mods.filter(mod => !mod.modrinth && mod.sha1);
		const found = await byHash([...new Set(unnamed.map(mod => mod.sha1))]);

		for (const mod of unnamed) if (found.has(mod.sha1)) mod.modrinth = found.get(mod.sha1);

		const described = await byId([...new Set(mods.map(mod => mod.modrinth).filter(Boolean))]);

		for (const mod of mods) {
			const project = described.get(mod.modrinth);

			if (!project) continue;

			mod.slug = project.slug;
			mod.title = project.title;
			if (project.source) mod.source = project.source;
		}
	} catch (error) {
		console.error(`Modrinth did not describe a pack's mods :: ${error.message}`);
	}
};

/**
 * A pack repository as the index keeps it: what it says of itself, and the pack in each format it has: an ender pack
 * and a packwiz pack at the head of its default branch, and the newest release's .mrpack. A .mrpack already read is
 * not downloaded again. Undefined when it has none of them.
 */
export const crawlPack = async (name, { recorded, scratch, now, modrinth = { projectsByHash, projectsById } }) => {
	const gistId = name.match(GIST_LINE)?.[1];

	if (gistId) return gistPack(await github.gist(gistId), { now });

	const repo = await github.repository(name);
	const formats = {};
	const enderSource = await fileAt(name, ENDER_PACK);

	if (enderSource !== undefined) formats.ender = parseEnderPack(enderSource);

	const packwizSource = await fileAt(name, 'pack.toml');

	if (packwizSource !== undefined) {
		const pack = packwizPack(packwizSource);
		const index = (await fileAt(name, pack.index)) ?? '';

		formats.packwiz = {
			name: pack.name,
			minecraft: pack.minecraft,
			loader: pack.loader.type,
			mods: await packwizMods(name, index),
		};
	}

	const found = mrpackRelease(await github.releases(name));

	if (found) {
		const kept = recorded?.formats?.mrpack;

		if (kept?.asset === found.asset.id) formats.mrpack = kept;
		else {
			const index = await readMrpack(found.asset, scratch);
			const dependencies = index.dependencies ?? {};
			const loader = Object.keys(MRPACK_LOADERS).find(key => dependencies[key]);

			formats.mrpack = {
				name: index.name,
				version: index.versionId,
				minecraft: dependencies.minecraft,
				loader: loader ? MRPACK_LOADERS[loader] : 'vanilla',
				tag: found.release.tag_name,
				asset: found.asset.id,
				url: found.asset.browser_download_url,
				mods: (index.files ?? [])
					.filter(file => file.path?.startsWith('mods/'))
					.map(file => ({
						file: basename(file.path),
						url: file.downloads?.[0],
						...(file.hashes?.sha1 ? { sha1: file.hashes.sha1.toLowerCase() } : {}),
					})),
			};
		}
	}

	if (Object.keys(formats).length === 0) return undefined;

	await describeMods(
		Object.values(formats).flatMap(format => format.mods.filter(mod => typeof mod === 'object')),
		modrinth,
	);

	return {
		repo: repo.full_name ?? name,
		host: 'github',
		description: repo.description ?? undefined,
		stars: repo.stargazers_count,
		pushed: repo.pushed_at,
		fetched: now,
		formats,
	};
};

/** A pack line naming a gist, as `ender export --gist` publishes a pack: `gist:<id>`. */
export const GIST_LINE = /^gist:([\da-f]+)$/i;

/** How ender export --gist describes the gist it publishes, before the pack's name. */
const ENDER_DESCRIPTION = /^ender pack: /;

/**
 * A gist's ender pack as the index keeps it, or undefined when the gist holds none. A gist has no star count GitHub
 * will tell, so it has none here.
 */
export const gistPack = async (body, { now, read = url => fetchSteady(url).then(response => response.text()) }) => {
	const file = body.files?.[ENDER_PACK];

	if (!file) return undefined;

	const pack = parseEnderPack(file.truncated ? await read(file.raw_url) : file.content);
	const description = (body.description ?? '').replace(ENDER_DESCRIPTION, '');

	return {
		repo: `${body.owner?.login ?? 'anonymous'}/${body.id}`,
		host: 'gist',
		description: description && description !== pack.name ? description : undefined,
		pushed: body.updated_at,
		fetched: now,
		formats: { ender: pack },
	};
};

/** Where a pack's page is kept: a repository's by its name, a gist's under gist/ beside them. */
export const packPage = pack => (pack.host === 'gist' ? `gist/${pack.repo}` : pack.repo);

const RELEASE = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\//;

const keyOfLine = line => (line.includes(':') ? line : `github:${line}`);

const LINE_URLS = { codeberg: 'https://codeberg.org/', gitlab: 'https://gitlab.com/' };

const urlOfLine = line => {
	const [host, name] = line.includes(':') ? line.split(':') : ['github', line];

	return `${LINE_URLS[host] ?? 'https://github.com/'}${name}`;
};

/**
 * Which indexed repository a pack's mod is: the one whose release a link downloads from, the one a spec names, the
 * one whose jar has that file's very name, read by the crawl, or last, the source a Modrinth project links.
 */
const matcher = (entries, records, modrinthIds) => {
	const keys = new Set(entries.map(entry => `${entry.host ?? 'github'}:${entry.repo}`));
	const byFile = new Map();

	for (const record of records)
		for (const release of record.releases)
			for (const asset of release.assets) byFile.set(asset.name, `${record.host}:${record.repo}`);

	return mod => {
		const named = mod.url?.match(RELEASE)?.[1] ?? mod.spec?.match(/^(?:gh|github):(.+)$/)?.[1];
		const project = mod.modrinth ?? mod.url?.match(MODRINTH_FILE)?.[1];
		const linked = project && modrinthIds[project];
		const key = named ? `github:${named}` : (byFile.get(mod.file) ?? (linked ? keyOfLine(linked) : undefined));

		return key && keys.has(key) ? key : undefined;
	};
};

/**
 * Where a mod the index has not got comes from, as far as anyone says: its source (a release it downloads from, a spec
 * naming a repository, or the source its Modrinth project links), and where its jar is (Modrinth, another link, or
 * nowhere a client can fetch without a key, as for CurseForge).
 */
export const whereFrom = (mod, modrinthIds = {}) => {
	const project = mod.modrinth ?? mod.url?.match(MODRINTH_FILE)?.[1];
	const released = mod.url?.match(RELEASE)?.[1] ?? mod.spec?.match(/^(?:gh|github):(.+)$/)?.[1];
	const source =
		(released && `https://github.com/${released}`) ??
		mod.source ??
		(project && modrinthIds[project] ? urlOfLine(modrinthIds[project]) : undefined) ??
		(mod.spec?.startsWith('cb:') ? urlOfLine(`codeberg:${mod.spec.slice(3)}`) : undefined) ??
		(mod.spec?.startsWith('gl:') ? urlOfLine(`gitlab:${mod.spec.slice(3)}`) : undefined);
	const fromModrinth = project || mod.spec?.startsWith('mr:');
	let jar = 'none';

	if (fromModrinth) jar = 'modrinth';
	else if (mod.url || released) jar = 'link';

	return { ...(source ? { source } : {}), jar, ...(project ? { modrinth: mod.slug ?? project } : {}) };
};

/** The repositories packs use that the index has not read, by how many packs use each: the crawl reads these first. */
export const packDemand = (packs, modrinthIds = {}) => {
	const demand = new Map();

	for (const pack of packs) {
		const lines = new Set();

		for (const format of Object.values(pack.formats ?? {}))
			for (const mod of format.mods ?? []) {
				if (typeof mod !== 'object') continue;

				const project = mod.modrinth ?? mod.url?.match(MODRINTH_FILE)?.[1];
				const line =
					mod.url?.match(RELEASE)?.[1] ?? (project && modrinthIds[project]) ?? (mod.source && lineOf(mod.source));

				if (line) lines.add(line);
			}

		for (const line of lines) demand.set(line, (demand.get(line) ?? 0) + 1);
	}

	return demand;
};

const INSTALL = {
	ender: pack => `ender import ${pack.host === 'gist' ? `gist:${pack.repo.split('/').at(-1)}` : `gh:${pack.repo}`}`,
	packwiz: pack => `ender import gh:${pack.repo}`,
	mrpack: (pack, format) => `ender import ${format.url}`,
};

/**
 * The pack listing, and each pack's page: each pack repository once, by the format its mods are best told in, with
 * each mod the index has, and for the rest, where its source and its jar are. A pack is said to take mods from
 * Modrinth, and to name some with no jar to be found, by counts the listing carries.
 */
export const buildPacks = (packs, entries, records, modrinthIds = {}) => {
	const match = matcher(entries, records, modrinthIds);

	return packs
		.map(pack => {
			const [kind, format] =
				['ender', 'packwiz', 'mrpack'].map(name => [name, pack.formats[name]]).find(([, found]) => found) ?? [];

			if (!format) return undefined;

			const mods = format.mods
				.map(mod => (typeof mod === 'string' ? { spec: mod } : mod))
				.map(mod => {
					const key = match(mod);
					const name = mod.title ?? mod.name ?? mod.spec ?? mod.file;

					return key
						? { name, key }
						: { name, ...(mod.file ? { file: mod.file } : {}), ...whereFrom(mod, modrinthIds) };
				});
			const others = mods.filter(mod => !mod.key);
			const matched = [...new Set(mods.map(mod => mod.key).filter(Boolean))];

			return {
				repo: pack.repo,
				host: pack.host,
				name: format.name ?? pack.repo.split('/').at(-1),
				description: pack.description,
				stars: pack.stars,
				pushed: pack.pushed,
				formats: Object.keys(pack.formats),
				minecraft: format.minecraft,
				loader: format.loader,
				...(format.version ? { version: format.version } : {}),
				count: mods.length,
				matched,
				fromModrinth: others.filter(mod => mod.jar === 'modrinth').length,
				unsourced: others.filter(mod => !mod.source).length,
				missing: others.filter(mod => mod.jar === 'none').length,
				install: INSTALL[kind](pack, format),
				mods,
			};
		})
		.filter(Boolean)
		.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || a.repo.localeCompare(b.repo));
};
