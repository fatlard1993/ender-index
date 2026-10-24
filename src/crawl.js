import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readMods } from 'ender-launcher/metadata';
import { scanJar } from 'ender-launcher/scan';

import { releases, repository } from './github';
import { updateRecord } from './record';
import { buildSearch } from './search';

export const DATA = join(import.meta.dir, '..', 'data');

/** Larger than any mod jar has reason to be; past it, the asset is recorded as refused rather than fetched. */
const MAX_DOWNLOAD = 256 * 1024 * 1024;

const readJson = async (path, fallback) => {
	const file = Bun.file(path);

	return (await file.exists()) ? file.json() : fallback;
};

const writeJson = async (path, value) => {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, `${JSON.stringify(value, undefined, '\t')}\n`);
};

export const readRepos = async () =>
	(await Bun.file(join(DATA, 'repos.txt')).text())
		.split('\n')
		.map(line => line.trim())
		.filter(line => line !== '' && !line.startsWith('#'));

export const recordPath = fullName => join(DATA, 'mods', `${fullName}.json`);

/** Download one asset, hash it on the way in, read its mods and scan it. */
const inspector = (scratch, knownBad) => async asset => {
	if (asset.size > MAX_DOWNLOAD) throw new Error(`${asset.size} bytes is past the ${MAX_DOWNLOAD} byte limit`);

	const response = await fetch(asset.browser_download_url);

	if (!response.ok) throw new Error(`download answered ${response.status}`);

	const bytes = new Uint8Array(await response.arrayBuffer());
	const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
	const path = join(scratch, `${asset.id}.jar`);

	await Bun.write(path, bytes);

	try {
		let mods;
		let metadataError;

		try {
			mods = await readMods(path);
		} catch (error) {
			metadataError = error.message;
		}

		return { sha256, mods, metadataError, scan: await scanJar(path), knownBad: knownBad.get(sha256) };
	} finally {
		await rm(path, { force: true });
	}
};

const crawlOne = async (fullName, { now, inspect }) => {
	const path = recordPath(fullName);
	const [repo, listed, record] = await Promise.all([repository(fullName), releases(fullName), readJson(path)]);
	const result = await updateRecord({ record, repo, releases: listed, now, inspect });

	if (result.record) await writeJson(path, result.record);

	return result.events;
};

const recordFiles = async () => {
	const owners = await readdir(join(DATA, 'mods')).catch(() => []);
	const files = await Promise.all(
		owners.map(async owner => (await readdir(join(DATA, 'mods', owner))).map(file => join(DATA, 'mods', owner, file))),
	);

	return files.flat().filter(file => file.endsWith('.json'));
};

export const crawl = async ({ only } = {}) => {
	const now = new Date().toISOString();
	const repos = only ?? (await readRepos());
	const knownBad = new Map(
		(await readJson(join(DATA, 'known-bad.json'), [])).map(entry => [entry.sha256, entry.reason]),
	);
	const scratch = await mkdtemp(join(tmpdir(), 'ender-index-'));
	const inspect = inspector(scratch, knownBad);
	const failures = [];

	console.log(
		`Crawling ${repos.length} repositories; each new release jar is downloaded and scanned, so this takes a while`,
	);

	try {
		for (const fullName of repos) {
			try {
				for (const event of await crawlOne(fullName, { now, inspect })) {
					console.log(`${event.type.padEnd(7)} ${event.repo} ${event.tag} ${event.asset}`);
				}
			} catch (error) {
				failures.push(fullName);
				console.error(`failed  ${fullName} :: ${error.message}`);
			}
		}
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}

	const records = await Promise.all((await recordFiles()).map(file => Bun.file(file).json()));

	await writeJson(join(DATA, 'search.json'), buildSearch(records));

	console.log(`${records.length} repositories indexed; ${failures.length} could not be crawled`);

	return failures.length > 0 ? 1 : 0;
};

if (import.meta.main) process.exit(await crawl({ only: process.argv.length > 2 ? process.argv.slice(2) : undefined }));
