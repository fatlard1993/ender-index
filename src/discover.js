import { join } from 'node:path';

import {
	DATA,
	readJson,
	readLines,
	readNoJars,
	readPacks,
	readRenames,
	readRepos,
	renamedLine,
	repositoryKey,
	uniqueRepositories,
} from './crawl';
import * as codeberg from './codeberg';
import { RateLimited } from './fetch';
import { DONATIONS, donationsByMod } from './funding';
import { searchCode, searchRepositories } from './github';
import * as gitlab from './gitlab';
import { modrinthSources, renamedSources } from './modrinth';
import { releasedByPacks } from './packs';
import { triage, triageLines, writeNoJars } from './triage';

/** Where each loader keeps its metadata in a source tree. Finding one is how a repository says it is a mod. */
export const MANIFESTS = [
	'filename:fabric.mod.json path:src/main/resources',
	'filename:quilt.mod.json path:src/main/resources',
	'filename:mods.toml path:META-INF',
	'filename:neoforge.mods.toml path:META-INF',
];

export const TOPICS = ['minecraft-mod', 'fabric-mod', 'fabricmc', 'forge-mod', 'neoforge', 'neoforge-mod', 'quilt-mod'];

/** The most results code search answers for one query, however many match it. */
export const RESULT_CAP = 1000;

/** The file size bands each manifest is searched in before any is split; the last has no upper end. */
const START_SIZES = [
	[0, 499],
	[500, 999],
	[1000, 1499],
	[1500, 2499],
	[2500, null],
];

/** Where the search stopped, and the bands it searches in, each split until it matches no more than RESULT_CAP. */
export const SLICES = 'discovery-slices.json';

/** A night's share of the job for the manifest search; the bands it does not reach are searched the nights after. */
const MINUTES = 25;

/** Code search allows ten requests a minute. */
const PAUSE = 6500;

const NOT_A_MOD_PATH = /(^|\/)(test|tests|fixtures?|examples?|samples?)\//i;

export const reposFrom = items =>
	items.filter(item => !NOT_A_MOD_PATH.test(item.path)).map(item => item.repository.full_name);

/** Code search also limits requests per minute; a reset that close is waited out rather than ending the search. */
const WAIT_AT_MOST = 2 * 60 * 1000;

const searchWaiting = async (query, page) => {
	for (;;) {
		try {
			return await searchCode(query, page);
		} catch (error) {
			const wait = error instanceof RateLimited ? error.resetAt - Date.now() + 1000 : Infinity;

			if (wait > WAIT_AT_MOST) throw error;

			console.log(`Waiting ${Math.ceil(wait / 1000)}s for the search rate limit`);

			await Bun.sleep(Math.max(wait, 0));
		}
	}
};

/** How a pack at a repository's root is found: its ender pack, or packwiz's pack.toml, which names packwiz. */
export const PACK_FILES = ['filename:ender.pack.json', 'filename:pack.toml packwiz'];

/** The topics a repository of .mrpack releases goes by; a release's files cannot be searched for. */
export const PACK_TOPICS = ['minecraft-modpack', 'mrpack', 'packwiz'];

/** Repository search allows thirty requests a minute. */
const REPOSITORY_PAUSE = 2100;

/** The repositories whose found file is at their root, which is where a pack is read from. */
export const packsFrom = items => items.filter(item => !item.path.includes('/')).map(item => item.repository.full_name);

const sorted = lines => uniqueRepositories(lines).sort((a, b) => a.localeCompare(b));

/** A list of repositories, its header comment kept. */
const writeList = async (file, lines, header) => {
	const kept = (
		await Bun.file(join(DATA, file))
			.text()
			.catch(() => header)
	)
		.split('\n')
		.filter(line => line.startsWith('#'));

	await Bun.write(join(DATA, file), `${[...(kept.length > 0 ? kept : [header]), ...lines].join('\n')}\n`);
};

/** Pack repositories found on GitHub: by a pack file at their root, or by the topics .mrpack repositories go by. */
const findPacks = async () => {
	const found = new Set();

	try {
		for (const query of PACK_FILES) {
			for (let page = 1; page <= 10; ++page) {
				const { items = [], total_count: total } = await searchWaiting(query, page);

				for (const repo of packsFrom(items)) found.add(repo);

				await Bun.sleep(PAUSE);

				if (page * 100 >= Math.min(total, 1000)) break;
			}
		}

		for (const topic of PACK_TOPICS) {
			for (let page = 1; page <= 10; ++page) {
				const { items = [], total_count: total } = await searchRepositories(`topic:${topic}`, page);

				for (const repo of items) found.add(repo.full_name);

				await Bun.sleep(REPOSITORY_PAUSE);

				if (page * 100 >= Math.min(total, 1000)) break;
			}
		}
	} catch (error) {
		if (!(error instanceof RateLimited)) throw error;

		console.log(`Stopped searching for packs at the rate limit; ${error.message}. Keeping the ${found.size} found.`);
	}

	return found;
};

export const startingSlices = () => ({
	next: 0,
	slices: MANIFESTS.flatMap(manifest => START_SIZES.map(([from, to]) => ({ manifest, from, to }))),
});

export const sliceQuery = ({ manifest, from, to }) => {
	if (to === null) return `${manifest} size:>=${from}`;

	return `${manifest} size:${from === to ? from : `${from}..${to}`}`;
};

/** A band split in two at its middle, or one with no upper end at twice its start. */
const halves = slice => {
	const middle = slice.to === null ? slice.from * 2 || 1 : Math.floor((slice.from + slice.to) / 2);

	return [
		{ ...slice, to: middle - (slice.to === null ? 1 : 0) },
		{ ...slice, from: middle + (slice.to === null ? 0 : 1) },
	];
};

/**
 * Search the bands from where the last night stopped, until the deadline or once round them all. A band matching more
 * than code search answers is split in two and its first half searched in its place, so over the nights every band
 * comes to hold no more than RESULT_CAP, and every file is answered for.
 */
export const searchSlices = async ({ state, search, deadline, sleep = Bun.sleep, log = console.log }) => {
	const slices = [...state.slices];
	const found = new Set();
	let next = state.next % slices.length;
	let searched = 0;

	const ask = async (slice, page) => {
		const { items = [], total_count: total } = await search(sliceQuery(slice), page);

		for (const repo of reposFrom(items)) found.add(repo);

		await sleep(PAUSE);

		return total;
	};

	try {
		while (Date.now() < deadline && searched < slices.length) {
			const slice = slices[next];
			const total = await ask(slice, 1);

			if (total > RESULT_CAP && (slice.to === null || slice.from < slice.to)) {
				slices.splice(next, 1, ...halves(slice));

				continue;
			}

			for (let page = 2; (page - 1) * 100 < Math.min(total, RESULT_CAP); ++page) await ask(slice, page);

			log(`${sliceQuery(slice)} :: ${total} files, ${found.size} repositories so far`);
			next = (next + 1) % slices.length;
			++searched;
		}
	} catch (error) {
		if (!(error instanceof RateLimited)) throw error;

		log(`Stopped searching at the rate limit; ${error.message}`);
	}

	log(`Searched ${searched} of ${slices.length} size bands; the next night starts at band ${next + 1}`);

	return { state: { next, slices }, found };
};

/**
 * The minutes discovery has: the crawl's discover step stops at forty, and a step stopped there writes nothing, so a
 * phase that would not fit in what is left waits for the next night instead.
 */
const DISCOVERY_MINUTES = 37;

/** What reading every Modrinth mod's source link takes, as it says when it starts. */
const MODRINTH_MINUTES = 11;

/**
 * Search each host without code search by topic, until the deadline. A host that rate-limits the search is left for the
 * next night after its first refusal: each further topic would wait out the same limit again.
 */
export const searchTopics = async ({ hosts, topics, found, deadline, log = console.log }) => {
	for (const [host, adapter] of Object.entries(hosts)) {
		for (const topic of topics) {
			if (Date.now() >= deadline) {
				log(`${host} topics :: out of time from ${topic} on; they wait for the next discovery`);

				break;
			}

			try {
				for (const name of await adapter.withTopic(topic)) found.add(`${host}:${name}`);
			} catch (error) {
				log(`${host} topic ${topic} :: ${error.message}`);

				if (error instanceof RateLimited) {
					log(`${host} topics :: left for the next discovery, as ${host} is refusing`);

					break;
				}
			}
		}

		log(`${host} topics :: ${found.size} repositories so far`);
	}

	return found;
};

export const discover = async () => {
	const slicesPath = join(DATA, SLICES);
	const started = Date.now();
	const left = () => DISCOVERY_MINUTES - (Date.now() - started) / 60_000;
	const existing = await readRepos();
	const released = releasedByPacks(await readPacks());
	const keepFound = async found => {
		const merged = sorted([...existing, ...found, ...released]);

		await writeList('repos.txt', merged, '# Mod repositories found on their hosts');

		return merged;
	};

	console.log(
		`Searching code for mod metadata for up to ${MINUTES} minutes, at ten requests a minute, from where the last discovery stopped`,
	);

	const { found, state } = await searchSlices({
		state: await readJson(slicesPath, startingSlices()),
		search: searchWaiting,
		deadline: Date.now() + MINUTES * 60_000,
	});

	await Bun.write(slicesPath, `${JSON.stringify(state, null, '\t')}\n`);
	// Kept now: the search has moved on past what it found, so a step stopped later would lose it for a whole round
	await keepFound(found);

	// Codeberg and GitLab offer no code search across repositories, so there a topic is the sign. Ending with time left
	// for the Modrinth sources, which every pack's mods are matched by
	await searchTopics({
		hosts: { codeberg, gitlab },
		topics: TOPICS,
		found,
		deadline: started + (DISCOVERY_MINUTES - MODRINTH_MINUTES - 2) * 60_000,
	});

	const merged = await keepFound(found);

	console.log(`Packs download release jars from ${released.length} GitHub repositories, each listed with those found`);

	console.log('Searching GitHub for pack repositories');

	const packs = sorted([...(await readLines('packs.txt')), ...(await findPacks())]);

	await writeList('packs.txt', packs, '# Pack repositories found on their hosts');
	console.log(`${packs.length} pack repositories found on their hosts`);

	// Most Modrinth projects link their source. Those on a host the index crawls are kept apart from what was found on
	// the hosts themselves, which comes first; a mod's slug and id are kept with its source, so a mod needed but not
	// indexed can be pointed at its source, and a pack's Modrinth mods matched to the index.
	try {
		if (left() < MODRINTH_MINUTES) {
			throw new Error(
				`${Math.floor(left())} minutes were left of discovery's ${DISCOVERY_MINUTES}, not the ten it takes`,
			);
		}

		console.log('Reading the source links of every Modrinth mod and modpack; this takes about ten minutes');

		const renames = await readRenames();
		const renamed = line => renamedLine(renames, line);
		const mods = renamedSources(await modrinthSources(), renamed);
		const modpacks = renamedSources(await modrinthSources({ type: 'modpack' }), renamed);
		const own = new Set(merged.map(repositoryKey));
		const ownPacks = new Set(packs.map(repositoryKey));
		const asJson = map =>
			`${JSON.stringify(Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b))), null, '\t')}\n`;

		await Bun.write(join(DATA, 'sources.json'), asJson(mods.sources));
		await Bun.write(join(DATA, 'modrinth-ids.json'), asJson(mods.ids));
		await Bun.write(join(DATA, DONATIONS), asJson(donationsByMod(mods.donations)));
		await writeList(
			'modrinth-repos.txt',
			sorted([...mods.sources.values()].filter(line => !own.has(repositoryKey(line)))),
			"# Known only from a Modrinth project's source link; crawled after every repository found on its host.",
		);
		await writeList(
			'modrinth-packs.txt',
			sorted([...modpacks.sources.values()].filter(line => !ownPacks.has(repositoryKey(line)))),
			"# Packs known only from a Modrinth modpack's source link; crawled after every pack found on its host.",
		);
		console.log(
			`Modrinth :: ${mods.sources.size} mods and ${modpacks.sources.size} modpacks link a source the index crawls`,
		);
	} catch (error) {
		console.error(`Modrinth sources :: ${error.message}; discovery went on without them`);
	}

	try {
		await writeNoJars(await triage({ lines: await triageLines(), noJars: await readNoJars() }));
	} catch (error) {
		console.error(`Triage :: ${error.message}; the crawl reads every Modrinth-only repository until it runs`);
	}

	console.log(`${merged.length - existing.length} new repositories; ${merged.length} found on their hosts`);

	return 0;
};

if (import.meta.main) process.exit(await discover());
