import { join } from 'node:path';

import { DATA, readRepos } from './crawl';
import { RateLimited, searchCode } from './github';

/** Where each loader keeps its metadata in a source tree. Finding one is how a repository says it is a mod. */
export const MANIFESTS = [
	'filename:fabric.mod.json path:src/main/resources',
	'filename:quilt.mod.json path:src/main/resources',
	'filename:mods.toml path:META-INF',
	'filename:neoforge.mods.toml path:META-INF',
];

/** Code search answers at most 1000 results per query, so each query is asked once per file size band. */
const SIZES = ['size:<500', 'size:500..999', 'size:1000..1499', 'size:1500..2499', 'size:>=2500'];

/** Code search allows ten requests a minute. */
const PAUSE = 6500;

const NOT_A_MOD_PATH = /(^|\/)(test|tests|fixtures?|examples?|samples?)\//i;

export const reposFrom = items =>
	items.filter(item => !NOT_A_MOD_PATH.test(item.path)).map(item => item.repository.full_name);

export const discover = async () => {
	const found = new Set();
	const queries = MANIFESTS.flatMap(manifest => SIZES.map(size => `${manifest} ${size}`));

	console.log(
		`Searching ${queries.length} queries at ten requests a minute; this takes up to ${Math.ceil((queries.length * 10 * PAUSE) / 60_000)} minutes`,
	);

	try {
		for (const query of queries) {
			for (let page = 1; page <= 10; ++page) {
				const { items = [], total_count: total } = await searchCode(query, page);

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

	const existing = await readRepos();
	const header = (await Bun.file(join(DATA, 'repos.txt')).text()).split('\n').filter(line => line.startsWith('#'));
	const merged = [...new Set([...existing, ...found])].sort((a, b) => a.localeCompare(b));

	await Bun.write(join(DATA, 'repos.txt'), `${[...header, ...merged].join('\n')}\n`);

	console.log(`${merged.length - existing.length} new repositories; ${merged.length} in all`);

	return 0;
};

if (import.meta.main) process.exit(await discover());
