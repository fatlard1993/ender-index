import { join } from 'node:path';

import {
	DATA,
	readLines,
	readModrinthRepos,
	readNoJars,
	readPacks,
	readRepos,
	repositoryKey,
	uniqueRepositories,
} from './crawl';
import * as codeberg from './codeberg';
import { RateLimited } from './fetch';
import { searchCode, searchRepositories } from './github';
import * as gitlab from './gitlab';
import { modrinthSources } from './modrinth';
import { releasedByPacks } from './packs';
import { triage, writeNoJars } from './triage';

/** Where each loader keeps its metadata in a source tree. Finding one is how a repository says it is a mod. */
export const MANIFESTS = [
	'filename:fabric.mod.json path:src/main/resources',
	'filename:quilt.mod.json path:src/main/resources',
	'filename:mods.toml path:META-INF',
	'filename:neoforge.mods.toml path:META-INF',
];

export const TOPICS = ['minecraft-mod', 'fabric-mod', 'fabricmc', 'forge-mod', 'neoforge', 'neoforge-mod', 'quilt-mod'];

/** Code search answers at most 1000 results per query, so each query is asked once per file size band. */
const SIZES = ['size:<500', 'size:500..999', 'size:1000..1499', 'size:1500..2499', 'size:>=2500'];

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

export const discover = async () => {
	const found = new Set();
	const queries = MANIFESTS.flatMap(manifest => SIZES.map(size => `${manifest} ${size}`));

	console.log(
		`Searching ${queries.length} queries at ten requests a minute; this takes up to ${Math.ceil((queries.length * 10 * PAUSE) / 60_000)} minutes`,
	);

	try {
		for (const query of queries) {
			for (let page = 1; page <= 10; ++page) {
				const { items = [], total_count: total } = await searchWaiting(query, page);

				for (const repo of reposFrom(items)) found.add(repo);

				await Bun.sleep(PAUSE);

				if (page * 100 >= Math.min(total, 1000)) break;
			}

			console.log(`${query} :: ${found.size} repositories so far`);
		}
	} catch (error) {
		if (!(error instanceof RateLimited)) throw error;

		console.log(`Stopped searching at the rate limit; ${error.message}. Keeping the ${found.size} found so far.`);
	}

	// Codeberg and GitLab offer no code search across repositories, so there a topic is the sign.
	for (const [host, adapter] of Object.entries({ codeberg, gitlab })) {
		for (const topic of TOPICS) {
			try {
				for (const name of await adapter.withTopic(topic)) found.add(`${host}:${name}`);
			} catch (error) {
				console.error(`${host} topic ${topic} :: ${error.message}`);
			}
		}

		console.log(`${host} topics :: ${found.size} repositories so far`);
	}

	const existing = await readRepos();
	const released = releasedByPacks(await readPacks());
	const merged = sorted([...existing, ...found, ...released]);

	console.log(`Packs download release jars from ${released.length} GitHub repositories, each listed with those found`);

	await writeList('repos.txt', merged, '# Mod repositories found on their hosts');

	console.log('Searching GitHub for pack repositories');

	const packs = sorted([...(await readLines('packs.txt')), ...(await findPacks())]);

	await writeList('packs.txt', packs, '# Pack repositories found on their hosts');
	console.log(`${packs.length} pack repositories found on their hosts`);

	// Most Modrinth projects link their source. Those on a host the index crawls are kept apart from what was found on
	// the hosts themselves, which comes first; a mod's slug and id are kept with its source, so a mod needed but not
	// indexed can be pointed at its source, and a pack's Modrinth mods matched to the index.
	try {
		console.log('Reading the source links of every Modrinth mod and modpack; this takes about seven minutes');

		const mods = await modrinthSources();
		const modpacks = await modrinthSources({ type: 'modpack' });
		const own = new Set(merged.map(repositoryKey));
		const ownPacks = new Set(packs.map(repositoryKey));
		const asJson = map =>
			`${JSON.stringify(Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b))), null, '\t')}\n`;

		await Bun.write(join(DATA, 'sources.json'), asJson(mods.sources));
		await Bun.write(join(DATA, 'modrinth-ids.json'), asJson(mods.ids));
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
		await writeNoJars(await triage({ lines: await readModrinthRepos({ resting: true }), noJars: await readNoJars() }));
	} catch (error) {
		console.error(`Triage :: ${error.message}; the crawl reads every Modrinth-only repository until it runs`);
	}

	console.log(`${merged.length - existing.length} new repositories; ${merged.length} found on their hosts`);

	return 0;
};

if (import.meta.main) process.exit(await discover());
