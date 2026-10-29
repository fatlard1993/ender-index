import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { readSourceMods } from 'ender-launcher/metadata';

import { DATA, parseLine, readJson, readRepos, recordPath, writeJson } from './crawl.js';
import { RateLimited } from './fetch.js';
import * as github from './github.js';

/** The repositories looked at for a source to build, each by the day it was and what was found. */
export const SOURCE_CHECKS = 'source-checks.json';

/** Repositories asked about in one query: each answer carries a few small files' text. */
export const BATCH = 10;

const DAY = 24 * 60 * 60 * 1000;

/** A run's share of the nightly job, which the crawl after it needs the most of. */
const MINUTES = 15;

/** How long a source is left before it is looked at again: one that builds moves on, one that does not rarely starts. */
export const RECHECK = { builds: 7, not: 30 };

const FILES = {
	gradlew: 'gradlew',
	gitmodules: '.gitmodules',
	properties: 'gradle.properties',
	settings: 'settings.gradle',
	settingsKts: 'settings.gradle.kts',
	fabric: 'src/main/resources/fabric.mod.json',
	quilt: 'src/main/resources/quilt.mod.json',
	neoforge: 'src/main/resources/META-INF/neoforge.mods.toml',
	forge: 'src/main/resources/META-INF/mods.toml',
};

/** The query asking, of each repository, what a build of its default branch would start from. */
export const queryFor = names =>
	`query { rateLimit { remaining resetAt } ${names
		.map((name, at) => {
			const [owner, repository] = name.split('/');
			const files = Object.entries(FILES)
				.map(([key, path]) => `${key}: object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Blob { text } }`)
				.join(' ');

			return `r${at}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repository)}) { nameWithOwner description stargazerCount isArchived isFork createdAt pushedAt licenseInfo { spdxId } defaultBranchRef { target { ... on Commit { oid committedDate } } } ${files} }`;
		})
		.join(' ')} }`;

const readProperties = text =>
	Object.fromEntries(
		(text ?? '')
			.split('\n')
			.map(line => line.trim())
			.filter(line => line !== '' && !line.startsWith('#') && line.includes('='))
			.map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
	);

/** The ids the loaders' example mods ship with, which a project started from one and left alone still has. */
const TEMPLATE_IDS = new Set(['modid', 'examplemod', 'example_mod', 'example-mod', 'template', 'mod_id', 'yourmodid']);

const GAME_VERSION_KEYS = ['minecraft_version', 'mc_version', 'minecraftVersion'];

/**
 * The game version a project builds against, which the JDK it builds with follows: its gradle.properties says, or
 * failing that the first version its mods' range for Minecraft names. A mod that names neither is not a Minecraft mod.
 */
export const gameVersionOf = (properties, mods) =>
	GAME_VERSION_KEYS.map(key => properties[key]).find(Boolean) ??
	mods
		.filter(mod => mod.depends?.includes('minecraft'))
		.map(mod => mod.minecraft?.match(/\d+\.\d+(\.\d+)?/)?.[0])
		.find(Boolean);

/** A settings file that reaches outside the repository builds only beside the checkouts its author keeps. */
const REACHES_OUT = /\.\.[/\\]|includeBuild/;

/**
 * Whether a repository's default branch builds on its own, and if so what it builds: a single gradle project with its
 * wrapper, its mod's metadata where a loader keeps it, and nothing it needs from outside its own files.
 */
export const sourceOf = answer => {
	const text = key => answer[key]?.text;

	if (answer.isArchived) return { why: 'archived' };
	if (answer.isFork) return { why: 'a fork, whose mod is listed where it came from' };
	if (text('gradlew') === undefined) return { why: 'no gradle wrapper' };
	if (answer.gitmodules) return { why: 'git submodules, which a zip of its source leaves out' };
	if (REACHES_OUT.test(text('settings') ?? text('settingsKts') ?? '')) return { why: 'builds with projects outside it' };

	const properties = readProperties(text('properties'));
	let mods;

	try {
		mods = readSourceMods(
			{ fabric: text('fabric'), quilt: text('quilt'), neoforge: text('neoforge'), forge: text('forge') },
			properties,
		);
	} catch (error) {
		return { why: `its mod metadata could not be read: ${error.message}` };
	}

	if (mods.length === 0) return { why: 'no mod metadata in src/main/resources' };
	if (mods.some(mod => typeof mod.id !== 'string' || mod.id.includes('${'))) {
		return { why: 'its mod id is filled in by its build' };
	}
	if (mods.some(mod => TEMPLATE_IDS.has(mod.id))) return { why: "a template's mod, never named" };

	const minecraft = gameVersionOf(properties, mods);

	if (minecraft === undefined) return { why: 'names no Minecraft version' };

	const commit = answer.defaultBranchRef?.target;

	if (commit?.oid === undefined) return { why: 'no commits' };

	return {
		source: {
			commit: commit.oid,
			committed: commit.committedDate,
			minecraft,
			loader: mods[0].loader,
			mods,
		},
	};
};

/** A record for a repository known only by its source, as the crawl records one by its releases. */
export const sourceRecord = (answer, source, checked) => ({
	repo: answer.nameWithOwner,
	host: 'github',
	description: answer.description ?? undefined,
	stars: answer.stargazerCount,
	archived: answer.isArchived,
	license: answer.licenseInfo?.spdxId ?? undefined,
	created: answer.createdAt,
	pushed: answer.pushedAt,
	releases: [],
	source: { ...source, checked },
});

/** Whether a repository looked at on this day, with this finding, is still left alone. */
const resting = (check, now) =>
	check !== undefined && now - Date.parse(check.checked) < RECHECK[check.builds ? 'builds' : 'not'] * DAY;

/**
 * Look at every repository found on GitHub with no record of releases, and not looked at lately, for a source that
 * builds on its own, BATCH at a time over GraphQL. One that does gets a record holding that source, which a release
 * replaces once the crawl finds one, and one that no longer does loses it; each finding is kept so the next run asks
 * again only when it is due.
 */
export const checkSources = async ({
	lines,
	checks,
	now = Date.now(),
	ask = github.graphql,
	recorded = async name => readJson(recordPath({ host: 'github', name })),
	write = async (name, record) => writeJson(recordPath({ host: 'github', name }), record),
	remove = async name => rm(recordPath({ host: 'github', name }), { force: true }),
	deadline = Number.POSITIVE_INFINITY,
	sleep = Bun.sleep,
	log = console.log,
}) => {
	const today = new Date(now).toISOString().slice(0, 10);
	const kept = { ...checks };
	const todo = [];
	const sourced = new Set();

	for (const line of lines) {
		const { host, name } = parseLine(line);

		if (host !== 'github' || resting(kept[name], now)) continue;

		const record = await recorded(name);

		if (record === undefined) todo.push(name);
		else if (record.releases.length === 0 && record.source !== undefined) {
			todo.push(name);
			sourced.add(name);
		}
	}

	log(`Looking at ${todo.length} repositories with no releases for a source that builds, ${BATCH} to a GraphQL query`);

	const counts = { builds: 0, not: 0, failed: 0 };

	for (let at = 0; at < todo.length; at += BATCH) {
		const names = todo.slice(at, at + BATCH);
		let data;

		if (Date.now() > deadline) {
			counts.failed += todo.length - at;
			log(`Out of time with ${todo.length - at} left for next time`);
			break;
		}

		try {
			data = await ask(queryFor(names));
		} catch (error) {
			if (!(error instanceof RateLimited)) {
				counts.failed += names.length;
				log(`Left ${names[0]} and ${names.length - 1} more for next time: ${error.message}`);
				continue;
			}

			if (error.resetAt + 5000 < deadline) {
				log(`Waiting: ${error.message}`);
				await sleep(Math.max(error.resetAt + 5000 - Date.now(), 0));
				at -= BATCH;
				continue;
			}

			counts.failed += todo.length - at;
			log(`Stopped at the rate limit with ${todo.length - at} left for next time: ${error.message}`);
			break;
		}

		for (const [index, name] of names.entries()) {
			const answer = data[`r${index}`];

			const { source, why } = answer ? sourceOf(answer) : { why: 'GitHub has no such repository' };

			kept[name] = { checked: today, builds: source !== undefined, ...(why ? { why } : {}) };
			counts[source ? 'builds' : 'not']++;

			if (source) await write(answer.nameWithOwner, sourceRecord(answer, source, today));
			else if (sourced.has(name)) await remove(name);
		}
	}

	log(
		`${counts.builds} build from source and are listed so, ${counts.not} do not, ${counts.failed} went unanswered`,
	);

	return kept;
};

export const writeChecks = async checks =>
	Bun.write(
		join(DATA, SOURCE_CHECKS),
		`${JSON.stringify(Object.fromEntries(Object.entries(checks).sort(([a], [b]) => a.localeCompare(b))), null, '\t')}\n`,
	);

if (import.meta.main) {
	await writeChecks(
		await checkSources({
			lines: await readRepos(),
			checks: await readJson(join(DATA, SOURCE_CHECKS), {}),
			deadline: Date.now() + MINUTES * 60 * 1000,
		}),
	);
}
