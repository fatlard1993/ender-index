import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readIcon, readMods } from 'ender-launcher/metadata';
import { scanJar } from 'ender-launcher/scan';

import * as codeberg from './codeberg';
import { fetchSteady } from './fetch';
import * as github from './github';
import * as gitlab from './gitlab';
import { HISTORY, PAGE, PAGES, updateRecord, vanish } from './record';
import { buildSearch, latestAssets } from './search';

export const DATA = join(import.meta.dir, '..', 'data');

/** Icons are kept by the hash of their bytes, so a mod whose icon never changes stores it once. */
export const ICONS = join(DATA, 'icons');

/** Larger than any mod jar has reason to be; past it, the asset is recorded as refused rather than fetched. */
export const MAX_DOWNLOAD = 256 * 1024 * 1024;

const readJson = async (path, fallback) => {
	const file = Bun.file(path);

	return (await file.exists()) ? file.json() : fallback;
};

export const writeJson = async (path, value) => {
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

/** Twice the largest a page draws an icon. A jar's 1024 pixel icon would otherwise cost the repository a hundred small ones. */
export const ICON_SIZE = 128;

/** An icon larger than a page draws, scaled to fit; one that fits keeps its own bytes, so pixel art stays exact. */
export const shrinkIcon = async icon => {
	const { width, height } = await new Bun.Image(icon.bytes).metadata();
	const scale = ICON_SIZE / Math.max(width, height);

	if (scale >= 1) return icon;

	const resized = new Bun.Image(icon.bytes).resize(
		Math.max(1, Math.round(width * scale)),
		Math.max(1, Math.round(height * scale)),
	);

	return { type: 'webp', bytes: Buffer.from(await resized.webp().bytes()) };
};

/** The jar's icon kept among the others, named for the page to fetch; null when it declares none a page can show. */
export const keepIcon = async (jar, icons = ICONS) => {
	let icon;

	try {
		const declared = await readIcon(jar);

		// An icon the image reader cannot open would show as a broken picture
		icon = declared && (await shrinkIcon(declared));
	} catch {
		return null;
	}

	if (icon === undefined) return null;

	const name = `${new Bun.CryptoHasher('sha256').update(icon.bytes).digest('hex')}.${icon.type}`;
	const file = Bun.file(join(icons, name));

	if (!(await file.exists())) {
		await mkdir(icons, { recursive: true });
		await Bun.write(file, icon.bytes);
	}

	return name;
};

/** Download one asset, hash it on the way in, read its mods and icon and scan it. */
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

		const icon = await keepIcon(path);

		try {
			return { sha256, mods, metadataError, icon, scan: await scanJar(path), knownBad: knownBad.get(sha256) };
		} catch (error) {
			return { sha256, error: error.message, knownBad: knownBad.get(sha256) };
		}
	} finally {
		await rm(path, { force: true });
	}
};

/**
 * Jars of the release a repository is listed by that were read before icons were, given theirs. Only that release's
 * are fetched again: the page shows one icon per mod, and every jar a crawl inspects from now on is read for one.
 */
export const fillIcons = async (record, scratch, icons = ICONS) => {
	const assets = latestAssets(record);
	let filled = 0;

	if (assets.some(asset => asset.icon)) return filled;

	for (const asset of assets) {
		if (asset.icon !== undefined) continue;

		const path = join(scratch, `icon-${asset.sha256}.jar`);

		try {
			const sha256 = await download(asset.url, path);

			// Bytes other than those scanned are not this asset's; the next crawl reads them as a swap.
			if (sha256 !== asset.sha256) continue;

			asset.icon = await keepIcon(path, icons);
			++filled;

			if (asset.icon) break;
		} catch (error) {
			console.error(`icon    ${record.repo} ${asset.name} :: ${error.message}`);
		} finally {
			await rm(path, { force: true });
		}
	}

	return filled;
};

/** Remove the icons no record names, left by a mod that changed its icon or left the index. */
export const pruneIcons = async (records, icons = ICONS) => {
	const named = new Set(
		records.flatMap(record => record.releases.flatMap(release => release.assets.map(asset => asset.icon))),
	);
	const files = await readdir(icons).catch(() => []);

	await Promise.all(files.filter(file => !named.has(file)).map(file => rm(join(icons, file))));
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

/**
 * Where a repository's readme is: GitLab says it with the project each crawl, the others are asked once and it is
 * kept. A failure leaves it unknown, to be asked again next crawl, rather than failing the repository.
 */
const readmeOf = async ({ host, name, repo, recorded }) => {
	if (repo.readme !== undefined) return repo.readme;
	if (recorded?.readme !== undefined) return recorded.readme;

	try {
		return await HOSTS[host].readme(name);
	} catch (error) {
		if (error instanceof github.RateLimited) throw error;

		console.error(`readme  ${name} :: ${error.message}`);

		return undefined;
	}
};

const crawlOne = async (line, { now, inspect, gameVersions, scratch }) => {
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

	if (result.record) {
		await fillIcons(result.record, scratch);
		await writeJson(canonical, {
			...result.record,
			readme: await readmeOf({ host, name, repo, recorded }),
			history: HISTORY,
		});
	}
	if (canonical !== path) await rm(path, { force: true });

	return result.events;
};

/** How long to wait for the rate limit to reset, or undefined when the reset comes too late to crawl on. */
export const waitForReset = (resetAt, deadline, now = Date.now()) =>
	resetAt + 5000 < deadline ? Math.max(resetAt + 5000 - now, 0) : undefined;

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

export const recordFiles = async () =>
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

	const crawlWaiting = async (fullName, options) => {
		for (;;) {
			try {
				return await crawlOne(fullName, options);
			} catch (error) {
				const wait = error instanceof github.RateLimited ? waitForReset(error.resetAt, deadline) : undefined;

				if (wait === undefined) throw error;

				console.log(`Waiting ${Math.ceil(wait / 60_000)} minutes at the rate limit; ${error.message}`);

				await github.saveCache();
				await Bun.sleep(wait);
			}
		}
	};

	console.log(
		`Crawling ${repos.length === 1 ? 'one repository' : `${repos.length} repositories`}; each new release jar is downloaded and scanned, so this takes a while`,
	);

	try {
		for (const [index, fullName] of repos.entries()) {
			if (Date.now() > deadline) {
				stopped = `Stopped at the time budget after ${index} of ${repos.length}; the rest are crawled first next time`;

				break;
			}

			try {
				for (const event of await crawlWaiting(fullName, { now, inspect, gameVersions, scratch })) {
					console.log(
						[event.type.padEnd(7), event.repo, event.tag, event.asset, event.error && `:: ${event.error}`]
							.filter(Boolean)
							.join(' '),
					);
				}
			} catch (error) {
				if (error instanceof github.RateLimited) {
					stopped = `Stopped at the rate limit after ${index} of ${repos.length}; ${error.message}, past the time budget, and the rest are crawled first next time`;

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
	await pruneIcons(records);

	console.log(`${records.length} repositories indexed; ${failures.length} could not be crawled`);

	return failures.length > 0 ? 1 : 0;
};

if (import.meta.main) process.exit(await crawl({ only: process.argv.length > 2 ? process.argv.slice(2) : undefined }));
