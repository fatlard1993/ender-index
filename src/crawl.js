import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { readContent, readIcon, readLinks, readMods } from 'ender-launcher/metadata';
import { HOSTS as HOST_NAMES } from 'ender-launcher/rank';
import { scanJar } from 'ender-launcher/scan';

import * as codeberg from './codeberg';
import { fetchSteady, RateLimited } from './fetch';
import * as github from './github';
import * as gitlab from './gitlab';
import { HISTORY, PAGE, PAGES, updateRecord, vanish } from './record';
import { buildPacks, crawlPack } from './packs';
import { buildSearch, latestAssets, themesOf } from './search';
import { FUNDING_PATHS, parseFunding, supportLinks } from './funding';
import { rawUrl } from './raw';
import { readmeSummary } from './summary';

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

/**
 * A list as JSON with each item on a line of its own: near the size of JSON with no spacing, which every page that
 * searches downloads, while a crawl's commit still shows which items changed.
 */
export const writeJsonLines = async (path, items) => {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, `[\n${items.map(item => JSON.stringify(item)).join(',\n')}\n]\n`);
};

export const readLines = async file =>
	(
		await Bun.file(join(DATA, file))
			.text()
			.catch(() => '')
	)
		.split('\n')
		.map(line => line.trim())
		.filter(line => line !== '' && !line.startsWith('#'));

/** The repositories found on their own hosts: by code search, by topic, or listed by hand. */
export const readRepos = () => readLines('repos.txt');

/** The Modrinth-only repositories found with no jar in their newest releases, each by the day it was looked at. */
export const NO_JARS = 'modrinth-no-jars.json';

/** How long a repository found with no jar is left before it is looked at again: an author can start attaching them. */
export const RECHECK_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

/** Whether a repository found with no jar on this day is still left alone. */
export const restingOn = (checked, now = Date.now()) =>
	checked !== undefined && now - Date.parse(checked) < RECHECK_DAYS * DAY;

export const readNoJars = () => readJson(join(DATA, NO_JARS), {});

/**
 * The repositories known only from a Modrinth project's source link, crawled after every one found on its host. Those
 * the triage found no jar in lately are left out, unless `resting` asks for them too.
 */
export const readModrinthRepos = async ({ resting = false } = {}) => {
	const lines = await readLines('modrinth-repos.txt');

	if (resting) return lines;

	const noJars = await readNoJars();

	return lines.filter(line => !restingOn(noJars[line]));
};

/**
 * The order a crawl takes repositories in: every one found on its own host before any known only from Modrinth, and
 * within each, the least recently fetched first, so a crawl cut short resumes where it stopped.
 */
export const crawlOrder = (found, fromModrinth, ageOf) => {
	const own = new Set(found);
	const oldestFirst = lines => [...lines].sort((a, b) => ageOf(a) - ageOf(b));

	return [...oldestFirst(found), ...oldestFirst(new Set(fromModrinth.filter(line => !own.has(line))))];
};

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

/** The links a jar's mods give that ask for support; none when its metadata cannot be read for them. */
const jarFunding = async jar => supportLinks(await readLinks(jar).catch(() => []));

/** What a jar adds, or null when its files cannot be read for it, so it is not asked again. */
const jarContent = async jar => readContent(jar).catch(() => null);

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
		const funding = await jarFunding(path);
		const content = await jarContent(path);

		try {
			return {
				sha256,
				mods,
				metadataError,
				icon,
				funding,
				content,
				scan: await scanJar(path),
				knownBad: knownBad.get(sha256),
			};
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

/**
 * Jars of the release a repository is listed by that were read before all a jar says for itself was: its support
 * links, what it adds, and what its mods suggest, break and conflict with. Each is fetched again once, as for icons,
 * and given what it lacks; one without content was read before relations were too, so its mods are read again.
 */
/** Whether a jar was read before the ranges its breaks and conflicts hold for were kept. */
export const lacksRanges = asset =>
	(asset.mods ?? []).some(mod => (mod.breaks && !mod.breaksVersions) || (mod.conflicts && !mod.conflictsVersions));

export const fillJars = async (record, scratch) => {
	for (const asset of latestAssets(record)) {
		if (asset.funding !== undefined && asset.content !== undefined && !lacksRanges(asset)) continue;

		const path = join(scratch, `again-${asset.sha256}.jar`);

		try {
			// Bytes other than those scanned are not this asset's; the next crawl reads them as a swap.
			if ((await download(asset.url, path)) !== asset.sha256) continue;

			asset.funding ??= await jarFunding(path);

			const unread = asset.content === undefined;

			if (unread) asset.content = await jarContent(path);
			if (unread || lacksRanges(asset)) asset.mods = await readMods(path).catch(() => asset.mods);
		} catch (error) {
			console.error(`again   ${record.repo} ${asset.name} :: ${error.message}`);
		} finally {
			await rm(path, { force: true });
		}
	}
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
		if (error instanceof RateLimited) throw error;

		console.error(`readme  ${name} :: ${error.message}`);

		return undefined;
	}
};

/**
 * For a repository that describes itself nowhere, its readme's first paragraph, read once and kept. A readme that does
 * not load leaves it unknown, to be read next crawl.
 */
const readmeSummaryOf = async ({ host, name, repo, recorded, readme }) => {
	if (repo.description || !readme) return undefined;
	if (recorded?.readmeSummary !== undefined) return recorded.readmeSummary;

	try {
		const response = await fetchSteady(rawUrl(host, name, readme), { headers: HOSTS[host].requestHeaders?.() });

		if (response.ok) return readmeSummary(await response.text());

		console.error(`summary ${name} :: its readme answered ${response.status}`);
	} catch (error) {
		console.error(`summary ${name} :: ${error.message}`);
	}

	return undefined;
};

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** The first of these files that loads, parsed, or [] when none is there; undefined when a host failed to answer. */
const fundingFrom = async (host, name, paths) => {
	for (const path of paths) {
		const response = await fetchSteady(rawUrl(host, name, path), { headers: HOSTS[host].requestHeaders?.() });

		if (response.ok) return parseFunding(await response.text());

		await response.body?.cancel();

		if (response.status !== 404) throw new Error(`${path} answered ${response.status}`);
	}

	return [];
};

/**
 * How a repository's author takes support: its FUNDING.yml, or on GitHub its owner's, which GitHub shows for every
 * repository of theirs without one. Read again weekly; an answer that fails keeps what was known.
 */
export const fundingOf = async ({ host, name, recorded, now, owners }) => {
	const known = { funding: recorded?.funding, fundingChecked: recorded?.fundingChecked };

	if (known.fundingChecked && Date.parse(now) - Date.parse(known.fundingChecked) < WEEK) return known;

	try {
		let funding = await fundingFrom(host, name, FUNDING_PATHS);

		if (funding.length === 0 && host === 'github') {
			const owner = name.split('/')[0];

			if (!owners.has(owner))
				owners.set(owner, fundingFrom(host, `${owner}/.github`, ['FUNDING.yml', '.github/FUNDING.yml']));
			funding = await owners.get(owner);
		}

		return { funding, fundingChecked: now };
	} catch (error) {
		console.error(`funding ${name} :: ${error.message}`);

		return known;
	}
};

const PICTURE = /\.(png|jpe?g|gif|webp)$/i;

/** Where a repository keeps what is not a picture of its mod: the game's textures in its sources, and its builds. */
const NOT_PICTURES = /(^|\/)(src|build|run|gradle|\.gradle|node_modules|libs?|textures?|lang)\//i;

/** A file named as a project's mark rather than a picture of it. */
const MARK = /(^|\/)(icon|logo|badge|banner)[^/]*$/i;

export const PICTURES_KEPT = 40;

/** Of a repository's files, the pictures of its mod: an image outside its sources and builds, and not its mark. */
export const pictureFiles = paths =>
	paths.filter(path => PICTURE.test(path) && !NOT_PICTURES.test(path) && !MARK.test(path)).slice(0, PICTURES_KEPT);

/**
 * The pictures a repository keeps of its mod, by path. GitHub lists a repository's files in one request, which is
 * spent again weekly; on another host, none are looked for.
 */
export const picturesOf = async ({ host, name, recorded, now }) => {
	const known = { pictures: recorded?.pictures, picturesChecked: recorded?.picturesChecked };

	if (host !== 'github') return {};
	if (known.picturesChecked && Date.parse(now) - Date.parse(known.picturesChecked) < WEEK) return known;

	try {
		return { pictures: pictureFiles(await github.filesOf(name)), picturesChecked: now };
	} catch (error) {
		if (error instanceof RateLimited) throw error;

		console.error(`pictures ${name} :: ${error.message}`);

		return known;
	}
};

const crawlOne = async (line, { now, inspect, gameVersions, scratch, owners }) => {
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
		await fillJars(result.record, scratch);
		const readme = await readmeOf({ host, name, repo, recorded });

		await writeJson(canonical, {
			...result.record,
			readme,
			readmeSummary: await readmeSummaryOf({ host, name, repo, recorded, readme }),
			...(await fundingOf({ host, name: repo.full_name ?? name, recorded, now, owners })),
			...(await picturesOf({ host, name: repo.full_name ?? name, recorded, now })),
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

/** Repositories crawled at once: most of a crawl is waiting on hosts, and GitHub asks that few requests be concurrent. */
const PARALLEL = 6;

const minutes = wait => `${Math.ceil(wait / 60_000)} ${Math.ceil(wait / 60_000) === 1 ? 'minute' : 'minutes'}`;

/**
 * Crawls each repository in order, `parallel` at a time. A host that answers with its rate limit has the rest of its
 * repositories set aside, so one host's limit holds back no other's; they are crawled once it lifts, while that is inside the time
 * budget, and first in the next crawl when it is not.
 */
/**
 * The longest one repository may take. Each request has its own limit, but a repository is many of them, and a worker
 * held on one past the deadline holds the whole crawl there.
 */
export const REPO_LIMIT = 15 * 60 * 1000;

const within = (work, limit) => {
	let timer;

	return Promise.race([
		work.finally(() => clearTimeout(timer)),
		new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`took longer than ${limit / 60_000} minutes`)), limit);
		}),
	]);
};

export const crawlEach = async (
	repos,
	{ crawlRepo, deadline, parallel = 1, sleep = Bun.sleep, beforeWait = async () => {}, repoLimit = REPO_LIMIT },
) => {
	const failures = [];
	const stopped = [];
	const limits = new Map();
	let waiting = repos;

	while (waiting.length > 0) {
		const later = [];
		const visit = async line => {
			const { host } = parseLine(line);

			if (Date.now() > deadline || limits.get(host)?.resetAt > Date.now()) {
				later.push(line);

				return;
			}

			try {
				await within(crawlRepo(line), repoLimit);
			} catch (error) {
				if (!(error instanceof RateLimited)) {
					failures.push(line);
					console.error(`failed  ${line} :: ${error.message}`);

					return;
				}

				if (!(limits.get(host)?.resetAt > Date.now()))
					console.log(`Setting the rest from ${HOST_NAMES[host]} aside at its rate limit; ${error.message}`);

				limits.set(host, error);
				later.push(line);
			}
		};
		let next = 0;

		await Promise.all(
			Array.from({ length: Math.min(parallel, waiting.length) }, async () => {
				while (next < waiting.length) await visit(waiting[next++]);
			}),
		);

		if (later.length === 0) break;

		if (Date.now() > deadline) {
			stopped.push(
				`Stopped at the time budget with ${later.length} of ${repos.length} left; they are crawled first next time`,
			);

			break;
		}

		const hosts = [...new Set(later.map(line => parseLine(line).host))];
		const first = hosts.toSorted((a, b) => limits.get(a).resetAt - limits.get(b).resetAt)[0];
		const wait = waitForReset(limits.get(first).resetAt, deadline);

		if (wait === undefined) {
			for (const host of hosts) {
				const left = later.filter(line => parseLine(line).host === host).length;

				stopped.push(
					`${limits.get(host).message}, past the time budget; ${left} of ${HOST_NAMES[host]}'s repositories are crawled first next time`,
				);
			}

			break;
		}

		console.log(
			`Waiting ${minutes(wait)} for ${HOST_NAMES[first]}'s rate limit, with ${later.length} ${later.length === 1 ? 'repository' : 'repositories'} set aside`,
		);
		await beforeWait();
		await sleep(wait);
		waiting = later;
	}

	return { failures, stopped };
};

const PACKS = join(DATA, 'packs');

const packPath = name => join(PACKS, `${name}.json`);

/**
 * The most of a crawl's time packs are read in, before the mods take the rest: a backlog of mods would otherwise spend
 * every crawl's whole budget, and no pack would be read at all.
 */
const PACK_SHARE = 1 / 6;

/**
 * Read each pack repository once, before the mods and within PACK_SHARE of the time budget: those found on GitHub before any
 * known only from Modrinth, and within each the least recently read first. A repository with no pack left loses its
 * record. Packs are read from GitHub alone, where nearly all of them are kept.
 */
const crawlPacks = async ({ deadline, scratch, now, parallel }) => {
	const onGitHub = line => !line.includes(':');
	const found = (await readLines('packs.txt')).filter(onGitHub);
	const fromModrinth = (await readLines('modrinth-packs.txt')).filter(onGitHub);
	const ages = new Map(
		await Promise.all(
			[...found, ...fromModrinth].map(async line => [line, Date.parse((await readJson(packPath(line)))?.fetched) || 0]),
		),
	);
	const lines = crawlOrder(found, fromModrinth, line => ages.get(line));

	if (lines.length > 0) console.log(`Reading ${lines.length} pack repositories`);

	return crawlEach(lines, {
		deadline,
		parallel,
		beforeWait: () => github.saveCache(),
		crawlRepo: async name => {
			const recorded = await readJson(packPath(name));
			const pack = await crawlPack(name, { recorded, scratch: join(scratch, 'packs'), now });

			if (pack) await writeJson(packPath(name), pack);
			else if (recorded) await rm(packPath(name), { force: true });
		},
	});
};

const packFiles = async () =>
	(await readdir(PACKS).catch(() => undefined))
		? [...new Bun.Glob('**/*.json').scanSync(PACKS)].map(file => join(PACKS, file))
		: [];

export const recordFiles = async () =>
	[...new Bun.Glob('**/*.json').scanSync(join(DATA, 'mods'))].map(file => join(DATA, 'mods', file));

/**
 * What the site reads, from every record and pack on disk: the search, the packs and the tags. Kept apart from the
 * crawl so a crawl stopped partway still leaves the site the records it wrote.
 */
export const writeLists = async () => {
	const records = await Promise.all((await recordFiles()).map(file => Bun.file(file).json()));
	const themes = themesOf(records);
	const search = buildSearch(records, themes, await readJson(join(DATA, 'sources.json'), {}));
	const packs = await Promise.all((await packFiles()).map(file => Bun.file(file).json()));

	await writeJsonLines(join(DATA, 'search.json'), search);
	await writeJsonLines(
		join(DATA, 'packs.json'),
		buildPacks(packs, search, records, await readJson(join(DATA, 'modrinth-ids.json'), {})),
	);
	await writeJson(join(DATA, 'tags.json'), themes.themes);
	await pruneIcons(records);

	return { records, packs };
};

export const crawl = async ({ only } = {}) => {
	const now = new Date().toISOString();
	const found = only ?? (await readRepos());
	const fromModrinth = only ? [] : await readModrinthRepos();
	const ages = new Map(
		await Promise.all(
			[...found, ...fromModrinth].map(async line => [
				line,
				line.includes(':') ? 0 : await github.lastFetched(github.repositoryPath(line)),
			]),
		),
	);
	const repos = crawlOrder(found, fromModrinth, line => ages.get(line));
	const knownBad = new Map(
		(await readJson(join(DATA, 'known-bad.json'), [])).map(entry => [entry.sha256, entry.reason]),
	);
	const scratch = await mkdtemp(join(tmpdir(), 'ender-index-'));
	const inspect = inspector(scratch, knownBad);
	const gameVersions = await releasedGameVersions();
	// An owner's FUNDING.yml stands for each of their repositories without one, so it is read once a crawl
	const owners = new Map();
	// A crawl the runner kills commits nothing, so it stops itself while there is time to commit.
	const minutes = Number(process.env.CRAWL_MINUTES ?? Infinity);
	const deadline = Date.now() + minutes * 60_000;

	console.log(
		`Crawling ${repos.length === 1 ? 'one repository' : `${repos.length} repositories`}; each new release jar is downloaded and scanned, so this takes a while`,
	);

	let outcome;
	let packOutcome = { failures: [], stopped: [] };
	const parallel = Number(process.env.CRAWL_PARALLEL ?? PARALLEL);

	try {
		if (!only) {
			packOutcome = await crawlPacks({
				deadline: Math.min(deadline, Date.now() + minutes * PACK_SHARE * 60_000),
				scratch,
				now,
				parallel,
			});
		}

		outcome = await crawlEach(repos, {
			deadline,
			parallel,
			beforeWait: () => github.saveCache(),
			crawlRepo: async fullName => {
				for (const event of await crawlOne(fullName, { now, inspect, gameVersions, scratch, owners })) {
					console.log(
						[event.type.padEnd(7), event.repo, event.tag, event.asset, event.error && `:: ${event.error}`]
							.filter(Boolean)
							.join(' '),
					);
				}
			},
		});
	} finally {
		await rm(scratch, { recursive: true, force: true });
		await github.saveCache();
	}

	for (const line of [...outcome.stopped, ...packOutcome.stopped]) console.log(line);

	console.log(spendingLine(github.spent()));

	const { records, packs } = await writeLists();

	console.log(`${records.length} repositories indexed; ${outcome.failures.length} could not be crawled`);
	console.log(`${packs.length} packs listed; ${packOutcome.failures.length} pack repositories could not be read`);

	return outcome.failures.length + packOutcome.failures.length > 0 ? 1 : 0;
};

if (import.meta.main) process.exit(await crawl({ only: process.argv.length > 2 ? process.argv.slice(2) : undefined }));
