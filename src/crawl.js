import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readMods } from 'ender-launcher/metadata';
import { scanJar } from 'ender-launcher/scan';

import * as codeberg from './codeberg';
import { fetchSteady } from './fetch';
import * as github from './github';
import * as gitlab from './gitlab';
import { HISTORY, PAGE, PAGES, updateRecord, vanish } from './record';
import { buildSearch } from './search';

export const DATA = join(import.meta.dir, '..', 'data');

/** Larger than any mod jar has reason to be; past it, the asset is recorded as refused rather than fetched. */
export const MAX_DOWNLOAD = 256 * 1024 * 1024;

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

const HOSTS = { github, codeberg, gitlab };

/** Where each host's records live. A dotted directory cannot collide with a GitHub owner, whose names have no dots. */
const DIRECTORIES = { github: '', codeberg: 'codeberg.org', gitlab: 'gitlab.com' };

/** A line of repos.txt: `owner/repo` on GitHub, or `codeberg:owner/repo`, `gitlab:group/project`. */
export const parseLine = line => {
	const separator = line.indexOf(':');
	const host = separator === -1 ? 'github' : line.slice(0, separator);

	if (HOSTS[host] === undefined) throw new Error(`Unknown host "${host}" in "${line}"`);

	return { host, name: separator === -1 ? line : line.slice(separator + 1) };
};

export const recordPath = ({ host, name }) => join(DATA, 'mods', DIRECTORIES[host], `${name}.json`);

/**
 * Stream a download to disk, hashing it on the way. Hosts do not all declare a size (GitLab release
 * links carry none), so the limit is enforced on the bytes as they arrive.
 */
export const download = async (url, path, { limit = MAX_DOWNLOAD } = {}) => {
	const response = await fetchSteady(url);

	if (!response.ok) throw new Error(`download answered ${response.status}`);

	const declared = Number(response.headers.get('content-length'));

	if (declared > limit) {
		await response.body?.cancel();

		throw new Error(`${declared} bytes is past the ${limit} byte limit`);
	}

	const hasher = new Bun.CryptoHasher('sha256');
	const writer = Bun.file(path).writer();
	let written = 0;

	try {
		for await (const chunk of response.body) {
			written += chunk.byteLength;

			if (written > limit) throw new Error(`past the ${limit} byte limit`);

			hasher.update(chunk);
			writer.write(chunk);
		}
	} finally {
		await writer.end();
	}

	return hasher.digest('hex');
};

/** Download one asset, hash it on the way in, read its mods and scan it. */
const inspector = (scratch, knownBad) => async asset => {
	if (asset.size > MAX_DOWNLOAD) throw new Error(`${asset.size} bytes is past the ${MAX_DOWNLOAD} byte limit`);

	const path = join(scratch, `${asset.id}.jar`);

	try {
		const sha256 = await download(asset.browser_download_url, path);
		let mods;
		let metadataError;

		try {
			mods = await readMods(path);
		} catch (error) {
			metadataError = error.message;
		}

		try {
			return { sha256, mods, metadataError, scan: await scanJar(path), knownBad: knownBad.get(sha256) };
		} catch (error) {
			return { sha256, error: error.message, knownBad: knownBad.get(sha256) };
		}
	} finally {
		await rm(path, { force: true });
	}
};

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

/** Releases from 1.7.10 on: older ones are rarely modded, and their short ids are mostly mod versions. */
const releasedGameVersions = async () => {
	try {
		const response = await fetchSteady(MANIFEST);

		if (!response.ok) throw new Error(`answered ${response.status}`);

		const releases = (await response.json()).versions
			.filter(version => version.type === 'release')
			.map(version => version.id);

		return new Set(releases.slice(0, releases.indexOf('1.7.10') + 1));
	} catch (error) {
		console.error(`The game version list could not be read (${error.message}); only the newest releases are watched`);

		return new Set();
	}
};

const crawlOne = async (line, { now, inspect, gameVersions }) => {
	const { host, name } = parseLine(line);
	const path = recordPath({ host, name });
	const record = await readJson(path);
	let repo;

	try {
		repo = await HOSTS[host].repository(name);
	} catch (error) {
		if (error.status !== 404) throw error;

		const result = vanish({ record, name, now });

		if (result.events.length > 0) await writeJson(path, result.record);

		return result.events;
	}

	// A renamed repository answers under its new name; its record is kept under that one, where search
	// and the launcher look for it.
	const canonical = recordPath({ host, name: repo.full_name ?? name });
	const recorded = canonical === path ? record : ((await readJson(canonical)) ?? record);
	const listed = [...(await HOSTS[host].releases(name))];

	if (recorded?.history !== HISTORY) {
		for (let page = 2, last = listed; last.length === PAGE && page <= PAGES; ++page) {
			last = await HOSTS[host].releases(name, page);
			listed.push(...last);
		}
	}

	const result = await updateRecord({ record: recorded, repo, releases: listed, now, inspect, host, gameVersions });

	if (result.record) await writeJson(canonical, { ...result.record, history: HISTORY });
	if (canonical !== path) await rm(path, { force: true });

	return result.events;
};

const count = number => number.toLocaleString('en-US');

/** Where the crawl spent the GitHub rate limit, which counts only requests answered in full. */
export const spendingLine = ({ full, unchanged, remaining, resetAt }) => {
	const kinds = Object.entries(full).sort(([, a], [, b]) => b - a);
	const total = kinds.reduce((sum, [, number]) => sum + number, 0);
	const breakdown =
		kinds.length > 0 ? ` (${kinds.map(([kind, number]) => `${kind} ${count(number)}`).join(', ')})` : '';
	const left = remaining === undefined ? '' : `; ${count(remaining)} left until ${new Date(resetAt).toISOString()}`;

	return `GitHub answered ${count(total)} requests in full${breakdown} and ${count(unchanged)} unchanged, which the rate limit does not count${left}`;
};

const recordFiles = async () =>
	[...new Bun.Glob('**/*.json').scanSync(join(DATA, 'mods'))].map(file => join(DATA, 'mods', file));

export const crawl = async ({ only } = {}) => {
	const now = new Date().toISOString();
	const listed = only ?? (await readRepos());
	const ages = new Map(
		await Promise.all(
			listed.map(async line => [line, line.includes(':') ? 0 : await github.lastFetched(github.repositoryPath(line))]),
		),
	);
	// Least recently fetched first, so a crawl cut short by the rate limit resumes where it stopped.
	const repos = [...listed].sort((a, b) => ages.get(a) - ages.get(b));
	const knownBad = new Map(
		(await readJson(join(DATA, 'known-bad.json'), [])).map(entry => [entry.sha256, entry.reason]),
	);
	const scratch = await mkdtemp(join(tmpdir(), 'ender-index-'));
	const inspect = inspector(scratch, knownBad);
	const gameVersions = await releasedGameVersions();
	const failures = [];
	// A crawl the runner kills commits nothing, so it stops itself while there is time to commit.
	const deadline = Date.now() + Number(process.env.CRAWL_MINUTES ?? Infinity) * 60_000;
	let stopped;

	console.log(
		`Crawling ${repos.length} repositories; each new release jar is downloaded and scanned, so this takes a while`,
	);

	try {
		for (const [index, fullName] of repos.entries()) {
			if (Date.now() > deadline) {
				stopped = `Stopped at the time budget after ${index} of ${repos.length}; the rest are crawled first next time`;

				break;
			}

			try {
				for (const event of await crawlOne(fullName, { now, inspect, gameVersions })) {
					console.log(
						[event.type.padEnd(7), event.repo, event.tag, event.asset, event.error && `:: ${event.error}`]
							.filter(Boolean)
							.join(' '),
					);
				}
			} catch (error) {
				if (error instanceof github.RateLimited) {
					stopped = `Stopped at the rate limit after ${index} of ${repos.length}; ${error.message}, and the rest are crawled first next time`;

					break;
				}

				failures.push(fullName);
				console.error(`failed  ${fullName} :: ${error.message}`);
			}
		}
	} finally {
		await rm(scratch, { recursive: true, force: true });
		await github.saveCache();
	}

	if (stopped) console.log(stopped);

	console.log(spendingLine(github.spent()));

	const records = await Promise.all((await recordFiles()).map(file => Bun.file(file).json()));

	await writeJson(join(DATA, 'search.json'), buildSearch(records));

	console.log(`${records.length} repositories indexed; ${failures.length} could not be crawled`);

	return failures.length > 0 ? 1 : 0;
};

if (import.meta.main) process.exit(await crawl({ only: process.argv.length > 2 ? process.argv.slice(2) : undefined }));
