import { join } from 'node:path';

import { DATA, SUBMITTED_PACKS, packRecordPath, readLines, writeJson, writeLists } from './crawl';
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
		say: `Listed: ${pageUrl(pack)}\n\nThe index reads it again every night, so changes to it show by the next day.`,
	};
};

/** Exits 3 when the issue names no pack it can list: the issue is told why, and stays open to be edited. */
if (import.meta.main) {
	const { listed, say } = await submitPack(process.env.PACK_BODY, { scratch: join(DATA, '..', '.cache', 'submit') });

	await Bun.write(process.env.SUBMIT_SAY ?? Bun.stdout, `${say}\n`);
	process.exit(listed ? 0 : 3);
}
