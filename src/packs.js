import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { readEntryJson } from 'ender-launcher/archive';
import { ENDER_PACK, parseEnderPack } from 'ender-launcher/enderPack';
import { packwizMetafiles, packwizPack } from 'ender-launcher/packwiz';

import { fetchSteady } from './fetch';
import * as github from './github';
import { lineOf, projectsByHash, projectsById } from './modrinth';
import { rawUrl } from './raw';

/** The largest .mrpack read: a pack is its index and its overrides, and one past this carries whole worlds. */
export const MRPACK_LIMIT = 100 * 1024 * 1024;

const MRPACK_INDEX = 'modrinth.index.json';

/** A file at the head of a repository's default branch, or undefined when it has none. */
const fileAt = async (name, path) => {
	const response = await fetchSteady(rawUrl('github', name, path));

	if (response.status === 404) return undefined;
	if (!response.ok) throw new Error(`${path} answered ${response.status}`);

	return response.text();
};

/** The mods of a packwiz pack, each as its .pw.toml names it: by name, file, link and the site it is updated from. */
const packwizMods = async (name, index) => {
	const listed = packwizMetafiles(index);
	const metafiles = listed.length > 0 ? listed : (await github.filesOf(name)).filter(path => path.endsWith('.pw.toml'));
	const mods = [];

	for (const metafile of metafiles) {
		const source = await fileAt(name, metafile);

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
const readMrpack = async (asset, scratch) => {
	if (asset.size > MRPACK_LIMIT) throw new Error(`${asset.name} is ${asset.size} bytes, past the ${MRPACK_LIMIT} read`);

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
	ender: repo => `ender import gh:${repo}`,
	packwiz: repo => `ender import gh:${repo}`,
	mrpack: (repo, format) => `ender import ${format.url}`,
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
				count: mods.length,
				matched,
				fromModrinth: others.filter(mod => mod.jar === 'modrinth').length,
				unsourced: others.filter(mod => !mod.source).length,
				missing: others.filter(mod => mod.jar === 'none').length,
				install: INSTALL[kind](pack.repo, format),
				mods,
			};
		})
		.filter(Boolean)
		.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || a.repo.localeCompare(b.repo));
};
