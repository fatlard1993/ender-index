import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { readEntryJson } from 'ender-launcher/archive';
import { ENDER_PACK, parseEnderPack } from 'ender-launcher/enderPack';
import { packwizMetafiles, packwizPack } from 'ender-launcher/packwiz';

import { fetchSteady } from './fetch';
import * as github from './github';
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

/**
 * A pack repository as the index keeps it: what it says of itself, and the pack in each format it has: an ender pack
 * and a packwiz pack at the head of its default branch, and the newest release's .mrpack. A .mrpack already read is
 * not downloaded again. Undefined when it has none of them.
 */
export const crawlPack = async (name, { recorded, scratch, now }) => {
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
					.map(file => ({ file: basename(file.path), url: file.downloads?.[0] })),
			};
		}
	}

	if (Object.keys(formats).length === 0) return undefined;

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

/** Where Modrinth serves a project's files, by the project's id. */
const MODRINTH_FILE = /^https:\/\/cdn\.modrinth\.com\/data\/([^/]+)\//;

const keyOfLine = line => (line.includes(':') ? line : `github:${line}`);

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

const INSTALL = {
	ender: repo => `ender import gh:${repo}`,
	packwiz: repo => `ender import gh:${repo}`,
	mrpack: (repo, format) => `ender import ${format.url}`,
};

/** The pack listing: each pack repository once, by the format its mods are best told in, with those the index has. */
export const buildPacks = (packs, entries, records, modrinthIds = {}) => {
	const match = matcher(entries, records, modrinthIds);

	return packs
		.map(pack => {
			const [kind, format] =
				['ender', 'packwiz', 'mrpack'].map(name => [name, pack.formats[name]]).find(([, found]) => found) ?? [];

			if (!format) return undefined;

			const mods = format.mods.map(mod => (typeof mod === 'string' ? { spec: mod } : mod));
			const matched = [...new Set(mods.map(match).filter(Boolean))];

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
				install: INSTALL[kind](pack.repo, format),
			};
		})
		.filter(Boolean)
		.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || a.repo.localeCompare(b.repo));
};
