import { join } from 'node:path';

import {
	DATA,
	SUBMITTED_PACKS,
	crawl,
	packRecordPath,
	parseLine,
	readJson,
	readLines,
	readRenames,
	renamedLine,
	writeJson,
	writeLists,
} from './crawl';
import { lineOf } from './modrinth';
import { crawlPack } from './packs';

const SITE = 'https://fatlard1993.github.io/ender-index';

const GIST_ID = /^[\da-f]{20,40}$/i;

const REPO = /^[\w.-]+\/[\w.-]+$/;

/**
 * The packs.txt line a player's answer names: a gist by its link or `gist:<id>`, or a GitHub repository by its link,
 * `gh:owner/repo` or `owner/repo`. Undefined for anything else.
 */
export const packLineOf = answer => {
	const text = answer
		.trim()
		.replace(/[#?].*$/, '')
		.replace(/(\.git|\/)$/, '');
	const gist = text.match(/^(?:gist:|https?:\/\/gist\.github\.com\/(?:[\w-]+\/)?)([\da-f]+)$/i)?.[1];

	if (gist) return GIST_ID.test(gist) ? `gist:${gist.toLowerCase()}` : undefined;

	const repo = text.replace(/^(?:gh:|https?:\/\/(?:www\.)?github\.com\/)/i, '');

	return REPO.test(repo) && !repo.split('/').some(part => /^\.+$/.test(part)) ? repo : undefined;
};

/** What an issue form answered under a heading, `_No response_` being no answer. */
export const answerOf = (body, heading) => {
	const found = (body ?? '')
		.match(new RegExp(`^### ${heading}\\s*\\n([\\s\\S]*?)(?=^### |(?![\\s\\S]))`, 'm'))?.[1]
		?.trim();

	return found && found !== '_No response_' ? found : undefined;
};

export const pageUrl = pack => `${SITE}/#/pack/${pack.host}/${pack.repo}`;

/**
 * Read the pack an issue submits and, when there is one, list it: its line kept in submitted-packs.txt for every
 * crawl after, its record written, and the site's lists rebuilt. Answers what to tell the issue, and whether it is done.
 */
export const submitPack = async (body, { now = new Date().toISOString(), scratch, crawl = crawlPack } = {}) => {
	const answer = answerOf(body, 'Pack');
	const line = answer && packLineOf(answer);

	if (!line) {
		return {
			listed: false,
			say: `${answer ? `\`${answer}\` is not` : 'The form names no'} pack the index can read: give a gist's link, or a GitHub repository's. Edit the issue and it is read again.`,
		};
	}

	const pack = await crawl(line, { now, scratch });

	if (!pack) {
		return {
			listed: false,
			say: `${line} holds no pack: the index reads an ender.pack.json or a packwiz pack.toml at the root of its default branch, a gist's ender.pack.json, or a .mrpack in its newest release. Edit the issue once it has one and it is read again.`,
		};
	}

	const submitted = await readLines(SUBMITTED_PACKS);

	if (!submitted.includes(line)) {
		await Bun.write(
			join(DATA, SUBMITTED_PACKS),
			`# Packs players asked the index to list\n${[...submitted, line].sort().join('\n')}\n`,
		);
	}

	await writeJson(packRecordPath(line), pack);

	await writeLists();

	return {
		listed: true,
		say: `Listed: ${pageUrl(pack)}\n\nThe index reads it again with every crawl, four times a day, so changes to it show within hours.`,
	};
};

/**
 * The repos.txt line a player's answer names: a GitHub, Codeberg or GitLab repository by its link, or a GitHub one as
 * `gh:owner/repo` or `owner/repo`. Undefined for anything else.
 */
export const modLineOf = answer => {
	const text = answer.trim().replace(/[#?].*$/, '');

	if (/^https?:\/\//i.test(text)) return lineOf(text);

	const repo = text.replace(/^gh:/i, '').replace(/(\.git|\/)$/, '');

	return REPO.test(repo) && !repo.split('/').some(part => /^\.+$/.test(part)) ? repo : undefined;
};

export const modUrl = ({ host = 'github', repo }) => {
	const split = repo.lastIndexOf('/');

	return `${SITE}/#/mod/${host}/${encodeURIComponent(repo.slice(0, split))}/${encodeURIComponent(repo.slice(split + 1))}`;
};

const listingOf = async line => {
	const { host, name } = parseLine(renamedLine(await readRenames(), line));
	const entries = await readJson(join(DATA, 'search.json'), []);

	return entries.find(entry => (entry.host ?? 'github') === host && entry.repo.toLowerCase() === name.toLowerCase());
};

/** A line kept in repos.txt, which a line added by hand opts into, so every crawl after reads it too. */
const optIn = async line => {
	const path = join(DATA, 'repos.txt');
	const lines = (await Bun.file(path).text()).split('\n').filter(Boolean);
	const comments = lines.filter(text => text.startsWith('#'));
	const repos = lines.filter(text => !text.startsWith('#'));

	if (repos.some(text => text.toLowerCase() === line.toLowerCase())) return;

	await Bun.write(path, `${[...comments, ...[...repos, line].sort((a, b) => a.localeCompare(b))].join('\n')}\n`);
};

/**
 * Crawl the mod an issue names and, when it has a release with a mod jar, list it, its line kept for every crawl
 * after. Answers what to tell the issue, and whether it is listed; `failed` when the crawl itself could not finish.
 */
export const submitMod = async (
	body,
	{ crawlOne = line => crawl({ only: [line] }), listed = listingOf, keep = optIn } = {},
) => {
	const answer = answerOf(body, 'Mod');
	const line = answer && modLineOf(answer);

	if (!line) {
		return {
			listed: false,
			say: `${answer ? `\`${answer}\` is not` : 'The form names no'} repository the index can read: give its link on GitHub, Codeberg or GitLab. Edit the issue and it is read again.`,
		};
	}

	if ((await crawlOne(line)) !== 0)
		return { listed: false, failed: true, say: `${line} could not be crawled just now.` };

	const entry = await listed(line);

	if (!entry) {
		return {
			listed: false,
			say: `${line} has no release with a mod jar the index can read, and no source it can build. It lists a repository whose newest release attaches a Fabric, Quilt, Forge or NeoForge jar. Edit the issue once it has one and it is read again.`,
		};
	}

	await keep(line);

	return {
		listed: true,
		say: `Listed: ${modUrl(entry)}\n\nThe index checks for new releases with every crawl, four times a day, so a new version shows within hours.`,
	};
};

/**
 * Exits 3 when the issue names no mod or pack it can list: the issue is told why, and stays open to be edited. Exits 1
 * when the crawl could not finish.
 */
if (import.meta.main) {
	const { listed, failed, say } = process.env.MOD_BODY
		? await submitMod(process.env.MOD_BODY)
		: await submitPack(process.env.PACK_BODY, { scratch: join(DATA, '..', '.cache', 'submit') });

	await Bun.write(process.env.SUBMIT_SAY ?? Bun.stdout, `${say}\n`);
	if (failed) process.exit(1);

	process.exit(listed ? 0 : 3);
}
