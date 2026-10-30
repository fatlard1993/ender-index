import { join } from 'node:path';

import { DATA, readJson, recordPath, writeJson } from './crawl';
import { DONATIONS, donationsOf } from './funding';
import { summarize } from './search';
import { answerOf } from './submit';

const SITE = 'https://fatlard1993.github.io/ender-index';

export const INTEREST = 'interest.json';

export const NOTICES = 'notices.json';

/** The players who must ask before the index tells an author: one could be anyone, and three is a few people. */
export const NEEDED = 3;

const HOSTS = { github: 'github', gh: 'github', codeberg: 'codeberg', gitlab: 'gitlab' };

const NAME = /^[\w.-]+(\/[\w.-]+)+$/;

/** The mod an answer names: its page on the index, `github:owner/repo` and the like, or `owner/repo` on GitHub. */
export const modOf = answer => {
	const text = (answer ?? '').trim().replace(/\/$/, '');
	const [, pageHost, pageName] = text.match(/#\/mod\/(\w+)\/(.+)$/) ?? [];
	const [, prefix, prefixed] = text.match(/^(\w+):(.+)$/) ?? [];
	const host = pageHost ?? (prefix ? HOSTS[prefix] : 'github');
	const name = pageName ?? prefixed ?? text;

	if (host === undefined || !NAME.test(name) || name.split('/').some(part => /^\.+$/.test(part))) return undefined;
	if (host !== 'gitlab' && name.split('/').length !== 2) return undefined;

	return { host, name };
};

const pageOf = ({ host, name }) => `${SITE}/#/mod/${host}/${name}`;

const guide = part => `${SITE}/#/authors/${part}`;

/** What each kind of asking is for, when it no longer needs asking, and what the index then tells the author. */
export const KINDS = {
	fund: {
		asked: 'would pay its author',
		settled: entry => entry.funding && `It already takes support: ${entry.funding.map(link => link.url).join(', ')}`,
		notice: (title, count) => ({
			title: `${count} players would like to support ${title}`,
			body: `Hi! This is the [ender index](${SITE}/), which lists Minecraft mods from the repositories their authors keep, and installs them with the ender launcher.

${count} players looking at ${title} on the index asked how they could pay you for it, and the index found no way to: no FUNDING.yml here or on your account, no support link in the mod's metadata, and no donation link on a Modrinth project linking here.

If you'd like to take support, any one of those is enough, and the index then shows it on the mod's page and in \`ender support\`: [how to add one](${guide('funding')}).

If you'd rather not, close this and nothing more is posted here; the index tells a repository this once.`,
		}),
	},
	release: {
		asked: 'want a built release',
		settled: entry => !entry.fromSource && 'It has a built release now',
		notice: (title, count) => ({
			title: `${count} players would like a built release of ${title}`,
			body: `Hi! This is the [ender index](${SITE}/), which lists Minecraft mods from the repositories their authors keep, and installs them with the ender launcher.

${title} has no release with a jar, so the index lists it by its source, and a player installing it has ender build it: their machine runs this repository's gradle build, and waits minutes for it. ${count} players asked for a built release instead.

A jar attached to a release is all it takes, and the index reads it within a day: [what the index reads from a release](${guide('releases')}).

If you'd rather not, close this and nothing more is posted here; the index tells a repository this once.`,
		}),
	},
};

const toldWhen = (noticed, due) => {
	if (noticed) return `Its author was told on ${noticed.at}.`;

	return due ? 'That is enough to tell its author, so the index does.' : `At ${NEEDED}, the index tells its author.`;
};

/**
 * Count a player asking for something of a mod, once per player, and when enough have asked and the author was never
 * told, the notice to tell them. Answers what to tell the issue, whether it was counted, and the notice when one is due.
 */
export const recordInterest = async ({
	body,
	kind,
	login,
	now = new Date().toISOString(),
	read = async mod => readJson(recordPath(mod)),
	donations = {},
	interest = {},
	notices = {},
}) => {
	const mod = modOf(answerOf(body, 'Mod'));

	if (mod === undefined) {
		return {
			counted: false,
			say: "The form names no mod the index lists: give its page's link, or its repository as github:owner/repo. Edit the issue and it is read again.",
		};
	}

	const record = await read(mod);
	const key = `${mod.host}:${mod.name}`;

	if (!record) return { counted: false, say: `The index lists no ${key}: ${pageOf(mod)} is not a page.` };

	const entry = summarize(record, donationsOf(donations, { host: mod.host, repo: record.repo ?? mod.name }));
	const settled = KINDS[kind].settled(entry);

	if (settled)
		return { counted: false, say: `${settled}, so there is nothing to ask its author for. Thanks for asking!` };

	const asking = new Set(interest[key]?.[kind] ?? []);
	const again = asking.has(login);

	asking.add(login);

	const count = asking.size;
	const noticed = notices[key]?.[kind];
	const due = count >= NEEDED && noticed === undefined;
	const title = entry.latest?.mods[0]?.name ?? mod.name.split('/').at(-1);

	return {
		counted: true,
		interest: { ...interest, [key]: { ...interest[key], [kind]: [...asking].sort() } },
		notices: due ? { ...notices, [key]: { ...notices[key], [kind]: { at: now.slice(0, 10), count } } } : notices,
		notice: due ? { repo: mod, ...KINDS[kind].notice(title, count) } : undefined,
		say: `${again ? 'You asked this before, and are counted once: still' : 'Counted:'} ${count} ${count === 1 ? 'player' : 'players'} ${KINDS[kind].asked} of ${title}. ${toldWhen(noticed, due)}`,
	};
};

/**
 * Exits 0 when counted, 3 when not: the issue is told why. A notice due is written to NOTICE_FILE as JSON, which the
 * workflow posts.
 */
if (import.meta.main) {
	const interestPath = join(DATA, INTEREST);
	const noticesPath = join(DATA, NOTICES);
	const result = await recordInterest({
		body: process.env.INTEREST_BODY,
		kind: process.env.INTEREST_KIND,
		login: process.env.INTEREST_LOGIN,
		interest: await readJson(interestPath, {}),
		notices: await readJson(noticesPath, {}),
		donations: await readJson(join(DATA, DONATIONS), {}),
	});

	if (result.counted) {
		await writeJson(interestPath, result.interest);
		await writeJson(noticesPath, result.notices);
	}

	if (result.notice) await Bun.write(process.env.NOTICE_FILE, JSON.stringify(result.notice));

	await Bun.write(process.env.INTEREST_SAY ?? Bun.stdout, `${result.say}\n`);
	process.exit(result.counted ? 0 : 3);
}
