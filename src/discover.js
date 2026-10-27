import { join } from 'node:path';

import { DATA, readRepos } from './crawl';
import * as codeberg from './codeberg';
import { RateLimited } from './fetch';
import { searchCode } from './github';
import * as gitlab from './gitlab';
import { modrinthSources } from './modrinth';

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

	// Most Modrinth mods link their source. Those on a host the index crawls are kept apart from what was found on the
	// hosts themselves, which comes first, and the slugs kept so a mod needed but not indexed can be pointed at its
	// source.
	let fromModrinth = [];

	try {
		console.log('Reading the source links of every Modrinth mod; this takes about six minutes');

		const sources = await modrinthSources();

		fromModrinth = [...new Set(sources.values())];
		await Bun.write(
			join(DATA, 'sources.json'),
			`${JSON.stringify(Object.fromEntries([...sources].sort(([a], [b]) => a.localeCompare(b))), null, '\t')}\n`,
		);
		console.log(`Modrinth sources :: ${fromModrinth.length} repositories linked`);
	} catch (error) {
		console.error(`Modrinth sources :: ${error.message}; searching went on without them`);
	}

	const existing = await readRepos();
	const header = (await Bun.file(join(DATA, 'repos.txt')).text()).split('\n').filter(line => line.startsWith('#'));
	const merged = [...new Set([...existing, ...found])].sort((a, b) => a.localeCompare(b));

	await Bun.write(join(DATA, 'repos.txt'), `${[...header, ...merged].join('\n')}\n`);

	const own = new Set(merged);
	const onlyModrinth = fromModrinth.filter(line => !own.has(line)).sort((a, b) => a.localeCompare(b));

	if (fromModrinth.length > 0) {
		await Bun.write(
			join(DATA, 'modrinth-repos.txt'),
			`# Known only from a Modrinth project's source link; crawled after every repository found on its host.\n${onlyModrinth.join('\n')}\n`,
		);
	}

	console.log(
		`${merged.length - existing.length} new repositories; ${merged.length} found on their hosts, and ${onlyModrinth.length} more known only from Modrinth`,
	);

	return 0;
};

if (import.meta.main) process.exit(await discover());
