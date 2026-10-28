import { join } from 'node:path';

import {
	DATA,
	NO_JARS,
	RECHECK_DAYS,
	parseLine,
	readModrinthRepos,
	readNoJars,
	recordPath,
	restingOn,
} from './crawl.js';
import { RateLimited } from './fetch.js';
import * as github from './github.js';

/** Repositories asked about in one query: fifty with ten releases each cost GitHub's GraphQL limit six points. */
export const BATCH = 50;

/** The releases a repository is looked through for a jar, newest first. */
const RELEASES = 10;

/** The query asking whether each repository has a jar in its newest releases. */
export const queryFor = names =>
	`query { rateLimit { remaining resetAt } ${names
		.map((name, at) => {
			const [owner, repository] = name.split('/');

			return `r${at}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repository)}) { releases(first: ${RELEASES}, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { releaseAssets(first: 30) { nodes { name } } } } }`;
		})
		.join(' ')} }`;

/** Whether each repository answered has a jar: one that is not there has none. */
export const jarsIn = (data, names) =>
	new Map(
		names.map((name, at) => [
			name,
			(data[`r${at}`]?.releases.nodes ?? []).some(release =>
				release.releaseAssets.nodes.some(asset => asset.name.toLowerCase().endsWith('.jar')),
			),
		]),
	);

/**
 * Look at every Modrinth-only GitHub repository the index has no record of, and not looked at lately, for a jar in its
 * newest releases, asking about fifty at once over GraphQL. Those with none are set aside for RECHECK_DAYS, so the
 * crawl, which spends REST requests on each repository it reads, spends none on them; most Modrinth projects attach
 * their jars on Modrinth alone. A batch GitHub will not answer is left for next time, and said so.
 */
export const triage = async ({
	lines,
	noJars,
	now = Date.now(),
	ask = github.graphql,
	indexed = async name => Bun.file(recordPath({ host: 'github', name })).exists(),
	parallel = 3,
	deadline = Number.POSITIVE_INFINITY,
	sleep = Bun.sleep,
	log = console.log,
}) => {
	const today = new Date(now).toISOString().slice(0, 10);
	const kept = { ...noJars };
	const todo = [];

	for (const line of lines) {
		const { host, name } = parseLine(line);

		if (host === 'github' && !restingOn(kept[name], now) && !(await indexed(name))) todo.push(name);
	}

	const batches = [];

	for (let at = 0; at < todo.length; at += BATCH) batches.push(todo.slice(at, at + BATCH));

	log(`Looking at ${todo.length} Modrinth-only repositories for jars, ${BATCH} to a GraphQL query`);

	const counts = { jars: 0, none: 0, failed: 0 };
	const left = [];
	let next = 0;

	const work = async () => {
		while (next < batches.length) {
			const names = batches[next++];

			for (;;) {
				try {
					for (const [name, jars] of jarsIn(await ask(queryFor(names)), names)) {
						if (jars) delete kept[name];
						else kept[name] = today;

						counts[jars ? 'jars' : 'none']++;
					}

					break;
				} catch (error) {
					if (error instanceof RateLimited && error.resetAt + 5000 < deadline) {
						log(`Waiting: ${error.message}`);
						await sleep(Math.max(error.resetAt + 5000 - Date.now(), 0));
						continue;
					}

					counts.failed += names.length;
					left.push(`${names[0]} and ${names.length - 1} more: ${error.message}`);
					break;
				}
			}
		}
	};

	await Promise.all(Array.from({ length: parallel }, work));

	log(
		`${counts.jars} have jars to crawl, ${counts.none} have none and are set aside for ${RECHECK_DAYS} days, ${counts.failed} went unanswered`,
	);
	for (const line of left) log(`Not looked at, left for next time: ${line}`);

	return kept;
};

export const writeNoJars = async noJars =>
	Bun.write(
		join(DATA, NO_JARS),
		`${JSON.stringify(Object.fromEntries(Object.entries(noJars).sort(([a], [b]) => a.localeCompare(b))), null, '\t')}\n`,
	);

if (import.meta.main) {
	await writeNoJars(await triage({ lines: await readModrinthRepos({ resting: true }), noJars: await readNoJars() }));
}
