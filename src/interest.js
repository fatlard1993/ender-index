import { join } from 'node:path';

import { INDEX_ISSUES, INDEX_REPOSITORY } from 'ender-launcher/indexIssues';

import { DATA, readJson, recordPath, writeJson } from './crawl';
import { fetchSteady } from './fetch';
import { DONATIONS, donationsOf } from './funding';
import { summarize } from './search';
import { answerOf } from './submit';

const SITE = 'https://fatlard1993.github.io/ender-index';

export const INTEREST = 'interest.json';

export const NOTICES = 'notices.json';

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

const keyOf = ({ host, name }) => `${host}:${name}`;

const pageOf = ({ host, name }) => `${SITE}/#/mod/${host}/${name}`;

const guide = part => `${SITE}/#/authors/${part}`;

const players = (count, { opening = false } = {}) =>
	count === 1 ? `${opening ? 'One' : '1'} player` : `${count} players`;

const KEPT_UP =
	"The count above is kept up to date as players ask. If you'd rather not, close this: the index leaves it closed, and posts nothing more here.";

/** What each kind of asking is for, when it no longer needs asking, and what the index then tells the author. */
export const KINDS = {
	fund: {
		asked: 'would pay its author',
		settled: entry => entry.funding && `It already takes support: ${entry.funding.map(link => link.url).join(', ')}`,
		notice: (title, count) => ({
			title: `${players(count)} would like to support ${title}`,
			body: `Hi! This is the [ender index](${SITE}/), which lists Minecraft mods from the repositories their authors keep, and installs them with the ender launcher.

${players(count, { opening: true })} looking at ${title} on the index asked how they could pay you for it, and the index found no way to: no FUNDING.yml here or on your account, no support link in the mod's metadata, and no donation link on a Modrinth project linking here.

If you'd like to take support, any one of those is enough, and the index then shows it on the mod's page and in \`ender support\`: [how to add one](${guide('funding')}).

${KEPT_UP}`,
		}),
	},
	release: {
		asked: 'want a built release',
		settled: entry => !entry.fromSource && 'It has a built release now',
		notice: (title, count) => ({
			title: `${players(count)} would like a built release of ${title}`,
			body: `Hi! This is the [ender index](${SITE}/), which lists Minecraft mods from the repositories their authors keep, and installs them with the ender launcher.

${title} has no release with a jar, so the index lists it by its source, and a player installing it has ender build it: their machine runs this repository's gradle build, and waits minutes for it. ${players(count, { opening: true })} asked for a built release instead.

A jar attached to a release is all it takes, and the index reads it within a day: [what the index reads from a release](${guide('releases')}).

${KEPT_UP}`,
		}),
	},
};

/** A mod's title as the index lists it, and what it already has of what is asked, or undefined when it is not listed. */
const describe = async (mod, kind, { read, donations }) => {
	const record = await read(mod);

	if (!record) return undefined;

	const entry = summarize(record, donationsOf(donations, { host: mod.host, repo: record.repo ?? mod.name }));

	return { title: entry.latest?.mods[0]?.name ?? mod.name.split('/').at(-1), settled: KINDS[kind].settled(entry) };
};

/** Count a player asking for something of a mod, once per player. Answers what to tell them, and whether it counted. */
export const recordInterest = async ({
	body,
	kind,
	login,
	read = async mod => readJson(recordPath(mod)),
	donations = {},
	interest = {},
}) => {
	const mod = modOf(answerOf(body, 'Mod'));

	if (mod === undefined) {
		return {
			counted: false,
			say: "The form names no mod the index lists: give its page's link, or its repository as github:owner/repo. Edit the issue and reopen it, and it is read again.",
		};
	}

	const described = await describe(mod, kind, { read, donations });

	if (!described) return { counted: false, say: `The index lists no ${keyOf(mod)}: ${pageOf(mod)} is not a page.` };
	if (described.settled) {
		return {
			counted: false,
			say: `${described.settled}, so there is nothing to ask its author for. Thanks for asking!`,
		};
	}

	const key = keyOf(mod);
	const asking = new Set(interest[key]?.[kind] ?? []);
	const again = asking.has(login);

	asking.add(login);

	return {
		counted: true,
		key,
		interest: { ...interest, [key]: { ...interest[key], [kind]: [...asking].sort() } },
		say: `${again ? 'You asked this before, and are counted once: still' : 'Counted:'} ${players(asking.size)} ${KINDS[kind].asked} of ${described.title}.`,
	};
};

/** What marks the index's notice for a mod and an ask, wherever it is posted, so a run finds the one it posted. */
export const markerOf = (key, kind) => `<!-- ender-index notice ${key} ${kind} -->`;

/**
 * Where a mod's notice goes, and as what. Live, on the mod's own repository; as a draft, and for a mod not on GitHub,
 * on the index, under a line saying where it would be posted, the notice itself as it would be posted.
 */
export const placeNotice = ({ key, kind, title, count, live }) => {
	const mod = modOf(key);
	const notice = KINDS[kind].notice(title, count);
	const marker = markerOf(key, kind);

	if (live && mod.host === 'github') {
		return { repo: mod.name, draft: false, title: notice.title, body: `${notice.body}\n\n${marker}` };
	}

	const where =
		mod.host === 'github'
			? `Live, this is posted as an issue on https://github.com/${mod.name}, and kept up to date as players ask.`
			: `The index cannot post on ${mod.host} yet, so this stays here even live.`;

	return {
		repo: INDEX_REPOSITORY,
		draft: true,
		labels: ['notice-draft'],
		title: `Draft for ${key}: ${notice.title}`,
		body: `> ${where}\n\n${notice.body}\n\n${marker}`,
	};
};

const API = 'https://api.github.com';

/** GitHub's API under a token: (method, path, body) to its answer, or an error saying what GitHub refused. */
export const githubApi = token => async (method, path, body) => {
	const response = await fetchSteady(`${API}${path}`, {
		method,
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${token}`,
			'x-github-api-version': '2022-11-28',
			...(body ? { 'content-type': 'application/json' } : {}),
		},
		body: body && JSON.stringify(body),
	});

	if (!response.ok) {
		const { message } = await response.json().catch(() => ({}));

		throw new Error(`GitHub answered ${response.status} to ${method} ${path}${message ? `: ${message}` : ''}`);
	}

	return response.status === 204 ? undefined : response.json();
};

/** The notice posted before under this marker: by its label on the index, by who posted it elsewhere. */
const postedBefore = async (api, placed, marker) => {
	const filter = placed.draft
		? `labels=${placed.labels.join(',')}`
		: `creator=${encodeURIComponent((await api('GET', '/user')).login)}`;
	const issues = await api('GET', `/repos/${placed.repo}/issues?${filter}&state=all&per_page=100`);

	return issues.find(issue => issue.body?.includes(marker));
};

/**
 * Post a notice, or bring the one posted before up to date; one its author closed is left as it is. Answers where it
 * is, and when it was closed.
 */
export const postNotice = async ({ api, placed, marker, recorded }) => {
	const existing =
		recorded?.issue?.repo === placed.repo
			? await api('GET', `/repos/${placed.repo}/issues/${recorded.issue.number}`)
			: await postedBefore(api, placed, marker);
	const at = issue => ({ repo: placed.repo, number: issue.number, url: issue.html_url });

	if (existing?.state === 'closed') return { issue: at(existing), closed: existing.closed_at.slice(0, 10) };

	if (existing) {
		await api('PATCH', `/repos/${placed.repo}/issues/${existing.number}`, { title: placed.title, body: placed.body });

		return { issue: at(existing) };
	}

	const created = await api('POST', `/repos/${placed.repo}/issues`, {
		title: placed.title,
		body: placed.body,
		...(placed.labels ? { labels: placed.labels } : {}),
	});

	return { issue: at(created) };
};

/** The day a notice was closed, or undefined while it is open. */
const closedOn = async (api, { repo, number }) => {
	const issue = await api('GET', `/repos/${repo}/issues/${number}`);

	return issue.state === 'closed' ? issue.closed_at.slice(0, 10) : undefined;
};

const ASK_TITLES = new Map([
	[INDEX_ISSUES.fund.title, 'fund'],
	[INDEX_ISSUES.release.title, 'release'],
]);

/** The ask an issue on the index is: by its form's labels, or by title for one ender filed, whose labels GitHub drops. */
export const askOf = issue => {
	if (issue.pull_request) return undefined;

	const labels = new Set(issue.labels.map(label => label.name ?? label));

	if (labels.has('interest')) return labels.has('fund') ? 'fund' : 'release';

	return ASK_TITLES.get(issue.title);
};

const noteLine = notice => {
	if (!notice?.issue) return '';
	if (notice.closed) return ` Its author closed the index's note on ${notice.closed}; the count is kept on the index.`;

	return notice.draft
		? ` The note to its author, kept on the index as a draft for now: ${notice.issue.url}`
		: ` The index's note to its author, kept up to date with the count: ${notice.issue.url}`;
};

/**
 * Count every open ask on the index, then post or update the notice of each mod and ask whose count, or place, its
 * notice does not show yet, and learn which of the rest their authors closed. Answers the counts, the notices, what to reply to each ask, and the notices that failed.
 */
export const processAsks = async ({
	indexApi,
	noticeApi = indexApi,
	live = false,
	interest: counted = {},
	notices: kept = {},
	read = async mod => readJson(recordPath(mod)),
	donations = {},
	now = new Date().toISOString(),
}) => {
	let interest = counted;
	const notices = structuredClone(kept);
	const asks = (await indexApi('GET', `/repos/${INDEX_REPOSITORY}/issues?state=open&per_page=100`))
		.map(issue => ({ issue, kind: askOf(issue) }))
		.filter(({ kind }) => kind !== undefined)
		.sort((a, b) => a.issue.number - b.issue.number);
	const replies = [];

	for (const { issue, kind } of asks) {
		const result = await recordInterest({ body: issue.body, kind, login: issue.user.login, read, donations, interest });

		if (result.counted) interest = result.interest;

		replies.push({ number: issue.number, counted: result.counted, say: result.say, key: result.key, kind });
	}

	const failures = [];

	for (const [key, kinds] of Object.entries(interest)) {
		for (const [kind, logins] of Object.entries(kinds)) {
			const recorded = notices[key]?.[kind];
			const target = live && key.startsWith('github:') ? key.slice('github:'.length) : INDEX_REPOSITORY;
			const inPlace = recorded?.issue?.repo === target;

			if (inPlace && recorded.closed) continue;

			if (inPlace && recorded.count === logins.length) {
				try {
					const closed = await closedOn(recorded.draft ? indexApi : noticeApi, recorded.issue);

					if (closed) notices[key] = { ...notices[key], [kind]: { ...recorded, closed } };
				} catch (error) {
					failures.push(`${key} ${kind}: ${error.message}`);
				}

				continue;
			}

			const described = await describe(modOf(key), kind, { read, donations });

			if (!described || described.settled) continue;

			const placed = placeNotice({ key, kind, title: described.title, count: logins.length, live });

			try {
				const posted = await postNotice({
					api: placed.draft ? indexApi : noticeApi,
					placed,
					marker: markerOf(key, kind),
					recorded,
				});

				notices[key] = {
					...notices[key],
					[kind]: {
						at: inPlace ? recorded.at : now.slice(0, 10),
						count: logins.length,
						draft: placed.draft,
						...posted,
					},
				};
			} catch (error) {
				failures.push(`${key} ${kind}: ${error.message}`);
			}
		}
	}

	return {
		interest,
		notices,
		replies: replies.map(({ key, kind, ...answer }) => ({
			...answer,
			say: `${answer.say}${answer.counted ? noteLine(notices[key]?.[kind]) : ''}`,
		})),
		failures,
	};
};

/** Answer each ask on the index and close it: counted, or not, with the reason in the answer for its player. */
export const reply = async ({ indexApi, replies }) => {
	for (const { number, counted, say } of replies) {
		await indexApi('POST', `/repos/${INDEX_REPOSITORY}/issues/${number}/comments`, { body: say });
		await indexApi('PATCH', `/repos/${INDEX_REPOSITORY}/issues/${number}`, {
			state: 'closed',
			state_reason: counted ? 'completed' : 'not_planned',
		});
	}
};

/**
 * `count` counts the open asks and posts their notices, writing the counts and the replies, and exits 2 when a notice
 * failed; `reply` answers and closes the asks, once the counts are kept. NOTICES=live posts notices on the mods' own
 * repositories, with NOTICE_TOKEN.
 */
if (import.meta.main) {
	const interestPath = join(DATA, INTEREST);
	const noticesPath = join(DATA, NOTICES);
	const indexApi = githubApi(process.env.GH_TOKEN);
	const live = process.env.NOTICES === 'live';

	if (process.argv[2] === 'reply') {
		await reply({ indexApi, replies: await Bun.file(process.env.INTEREST_REPLIES).json() });
		process.exit(0);
	}

	const result = await processAsks({
		indexApi,
		noticeApi: live ? githubApi(process.env.NOTICE_TOKEN) : indexApi,
		live,
		interest: await readJson(interestPath, {}),
		notices: await readJson(noticesPath, {}),
		donations: await readJson(join(DATA, DONATIONS), {}),
	});

	await writeJson(interestPath, result.interest);
	await writeJson(noticesPath, result.notices);
	await Bun.write(process.env.INTEREST_REPLIES, JSON.stringify(result.replies));

	console.log(`Read ${result.replies.length} asks; ${Object.keys(result.notices).length} mods have a notice`);
	for (const failure of result.failures) console.error(`The notice for ${failure}`);
	process.exit(result.failures.length > 0 ? 2 : 0);
}
