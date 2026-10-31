import { describe, expect, test } from 'bun:test';

import { INDEX_ISSUES, issueBody } from 'ender-launcher/indexIssues';

import { markerOf, modOf, processAsks, recordInterest, reply } from '../src/interest';

const body = mod => `### Mod\n\n${mod}`;

const sourceOnly = {
	repo: 'a/boats',
	host: 'github',
	releases: [],
	source: { commit: 'c0ffee0', committed: '2026-10-01', mods: [{ loader: 'fabric', id: 'boats', name: 'Big Boats' }] },
};

const released = {
	repo: 'a/boats',
	host: 'github',
	releases: [
		{
			tag: 'v1',
			published: '2026-10-01',
			assets: [{ name: 'boats.jar', mods: [{ loader: 'fabric', id: 'boats', name: 'Big Boats' }] }],
		},
	],
};

const ask = (
	kind,
	login,
	{ record = sourceOnly, interest = {}, notices = {}, donations = {}, mod = 'github:a/boats' } = {},
) =>
	recordInterest({
		body: body(mod),
		kind,
		login,
		now: '2026-10-29T00:00:00Z',
		read: async () => record,
		interest,
		notices,
		donations,
	});

describe('the mod a player names', () => {
	test('is its page, a host and its name, or a GitHub repository', () => {
		expect(modOf('https://fatlard1993.github.io/ender-index/#/mod/codeberg/a/b')).toEqual({
			host: 'codeberg',
			name: 'a/b',
		});
		expect(modOf('gh:a/b')).toEqual({ host: 'github', name: 'a/b' });
		expect(modOf('gitlab:g/sub/p')).toEqual({ host: 'gitlab', name: 'g/sub/p' });
		expect(modOf('a/b')).toEqual({ host: 'github', name: 'a/b' });
	});

	test('is nothing else', () => {
		for (const answer of ['', 'a', 'a/b/c', 'svn:a/b', '../a', 'a/..', 'a b/c']) expect(modOf(answer)).toBeUndefined();
	});
});

describe('asking', () => {
	test('counts each player once, and tells one who asks again so', async () => {
		let interest = {};
		const results = [];

		for (const login of ['ann', 'bo', 'ann']) {
			const result = await ask('release', login, { interest });

			interest = result.interest;
			results.push(result);
		}

		expect(results.map(result => result.say)).toEqual([
			'Counted: 1 player want a built release of Big Boats.',
			'Counted: 2 players want a built release of Big Boats.',
			'You asked this before, and are counted once: still 2 players want a built release of Big Boats.',
		]);
		expect(interest['github:a/boats'].release).toEqual(['ann', 'bo']);
	});

	test('is not counted for what the mod already has', async () => {
		expect(await ask('release', 'ann', { record: released })).toMatchObject({
			counted: false,
			say: expect.stringContaining('built release now'),
		});

		const funded = { ...released, funding: [{ platform: 'ko_fi', url: 'https://ko-fi.com/a' }] };

		expect((await ask('fund', 'ann', { record: funded })).say).toContain('https://ko-fi.com/a');

		const donations = { 'github:a/boats': [{ platform: 'patreon', url: 'https://www.patreon.com/a' }] };

		expect(await ask('fund', 'ann', { record: released, donations })).toMatchObject({
			counted: false,
			say: expect.stringContaining('https://www.patreon.com/a'),
		});
	});

	test('is not counted for a mod the index does not list, and says so', async () => {
		expect(await ask('fund', 'ann', { record: null })).toMatchObject({
			counted: false,
			say: expect.stringContaining('lists no github:a/boats'),
		});
		expect((await ask('fund', 'ann', { mod: 'not a mod' })).counted).toBe(false);
	});
});

/** GitHub's issues as the API answers them, held in memory: issues by repository, and every request made. */
const fakeGithub = ({ login = 'notice-bot', issues = {} } = {}) => {
	const repos = structuredClone(issues);
	const calls = [];
	let next = 100;
	const api = async (method, path, body) => {
		calls.push(`${method} ${path}`);

		if (path === '/user') return { login };

		const url = new URL(path, 'https://api.github.com');
		const [, repo, number, comments] = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/issues(?:\/(\d+))?(\/comments)?$/);
		const list = (repos[repo] ??= []);
		const issue = list.find(each => each.number === Number(number));

		if (comments) {
			issue.comments = [...(issue.comments ?? []), body.body];

			return {};
		}
		if (issue) {
			if (method === 'PATCH')
				Object.assign(issue, body, body.state === 'closed' ? { closed_at: '2026-10-30T00:00:00Z' } : {});

			return issue;
		}
		if (method === 'POST') {
			const created = {
				number: ++next,
				html_url: `https://github.com/${repo}/issues/${next}`,
				state: 'open',
				labels: (body.labels ?? []).map(name => ({ name })),
				user: { login },
				title: body.title,
				body: body.body,
			};

			list.push(created);

			return created;
		}

		const { state, labels, creator } = Object.fromEntries(url.searchParams);

		return list.filter(
			each =>
				(state === 'all' || each.state === state) &&
				(!labels || each.labels.some(label => label.name === labels)) &&
				(!creator || each.user.login === creator),
		);
	};

	return { api, repos, calls };
};

const INDEX = 'fatlard1993/ender-index';

const askIssue = (number, login, kind = 'fund', mod = 'github:a/boats') => ({
	number,
	title: INDEX_ISSUES[kind].title,
	labels: [],
	body: issueBody(kind, mod),
	user: { login },
	state: 'open',
});

const processing = (github, state = {}, options = {}) =>
	processAsks({
		indexApi: github.api,
		read: async () => released,
		now: '2026-10-30T12:00:00Z',
		...state,
		...options,
	});

const notices = github =>
	github.repos[INDEX].filter(issue => issue.labels.some(label => label.name === 'notice-draft'));

describe('a notice to an author', () => {
	test('is not posted when notices are off: the ask is counted and answered, and nothing else is written', async () => {
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(2, 'ann')] } });
		const result = await processing(github, {}, { post: false });

		expect(notices(github)).toEqual([]);
		expect(result.notices).toEqual({});
		expect(result.interest).toEqual({ 'github:a/boats': { fund: ['ann'] } });
		expect(result.replies).toEqual([
			{ number: 2, counted: true, say: 'Counted: 1 player would pay its author of Big Boats.' },
		]);
	});

	test('is posted on the first ask, as a draft on the index under a line saying where it would go live', async () => {
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(2, 'ann')] } });
		const result = await processing(github);
		const [draft] = notices(github);

		expect(draft.title).toBe('Draft for github:a/boats: 1 player would like to support Big Boats');
		expect(draft.body).toStartWith('> Live, this is posted as an issue on https://github.com/a/boats');
		expect(draft.body).toContain('One player looking at Big Boats on the index asked how they could pay you');
		expect(draft.body).toContain('#/authors/funding');
		expect(draft.body).toEndWith(markerOf('github:a/boats', 'fund'));
		expect(result.notices['github:a/boats'].fund).toEqual({
			at: '2026-10-30',
			count: 1,
			draft: true,
			issue: { repo: INDEX, number: draft.number, url: draft.html_url },
		});
		expect(result.replies).toEqual([
			{
				number: 2,
				counted: true,
				say: `Counted: 1 player would pay its author of Big Boats. The note to its author, kept on the index as a draft for now: ${draft.html_url}`,
			},
		]);
	});

	test('is the same issue, brought up to date with the count as more players ask; one asking again changes nothing', async () => {
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(2, 'ann')] } });
		const first = await processing(github);

		await reply({ indexApi: github.api, replies: first.replies });
		github.repos[INDEX].push(askIssue(3, 'bo'), askIssue(4, 'ann'));

		const second = await processing(github, { interest: first.interest, notices: first.notices });

		expect(notices(github)).toHaveLength(1);
		expect(notices(github)[0].title).toBe('Draft for github:a/boats: 2 players would like to support Big Boats');
		expect(second.notices['github:a/boats'].fund).toMatchObject({ at: '2026-10-30', count: 2 });
		expect(second.replies.map(answer => answer.say.split('.')[0])).toEqual([
			'Counted: 2 players would pay its author of Big Boats',
			'You asked this before, and are counted once: still 2 players would pay its author of Big Boats',
		]);

		await reply({ indexApi: github.api, replies: second.replies });
		github.calls.length = 0;
		await processing(github, { interest: second.interest, notices: second.notices });

		expect(github.calls.filter(call => !call.startsWith('GET'))).toEqual([]);
	});

	test('is found by its marker when its record was lost, and not posted twice', async () => {
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(2, 'ann')] } });
		const first = await processing(github);

		github.repos[INDEX].push(askIssue(3, 'bo'));
		await processing(github, { interest: first.interest, notices: {} });

		expect(notices(github)).toHaveLength(1);
		expect(notices(github)[0].title).toContain('2 players');
	});

	test("live, is posted on the mod's own repository and kept up to date there, the draft left where it was", async () => {
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(2, 'ann')] } });
		const drafted = await processing(github);
		const author = fakeGithub();

		github.repos[INDEX].push(askIssue(3, 'bo'));

		const result = await processing(
			github,
			{ interest: drafted.interest, notices: drafted.notices },
			{ live: true, noticeApi: author.api },
		);
		const [posted] = author.repos['a/boats'];

		expect(author.repos['a/boats']).toHaveLength(1);
		expect(posted.title).toBe('2 players would like to support Big Boats');
		expect(posted.body).toStartWith('Hi! This is the [ender index]');
		expect(posted.body).toEndWith(markerOf('github:a/boats', 'fund'));
		expect(notices(github)[0].title).toContain('1 player');
		expect(result.notices['github:a/boats'].fund).toMatchObject({ count: 2, draft: false, issue: { repo: 'a/boats' } });
		expect(result.replies.at(-1).say).toContain(`kept up to date with the count: ${posted.html_url}`);
	});

	test('its author closed is left closed, and the player told so', async () => {
		const author = fakeGithub({
			issues: {
				'a/boats': [
					{
						number: 5,
						html_url: 'https://github.com/a/boats/issues/5',
						state: 'closed',
						closed_at: '2026-10-29T08:00:00Z',
						labels: [],
						user: { login: 'notice-bot' },
						title: '1 player would like to support Big Boats',
						body: `Hi!\n\n${markerOf('github:a/boats', 'fund')}`,
					},
				],
			},
		});
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(3, 'bo')] } });
		const result = await processing(
			github,
			{ interest: { 'github:a/boats': { fund: ['ann'] } } },
			{ live: true, noticeApi: author.api },
		);

		expect(author.calls.filter(call => !call.startsWith('GET'))).toEqual([]);
		expect(result.notices['github:a/boats'].fund).toMatchObject({ closed: '2026-10-29', count: 2 });
		expect(result.replies[0].say).toContain("Its author closed the index's note on 2026-10-29");
	});

	test('closed by its author with no ask since is learned on the next run', async () => {
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(2, 'ann')] } });
		const author = fakeGithub();
		const first = await processing(github, {}, { live: true, noticeApi: author.api });
		const [posted] = author.repos['a/boats'];

		Object.assign(posted, { state: 'closed', closed_at: '2026-10-31T09:00:00Z' });

		const live = { live: true, noticeApi: author.api };
		const quiet = await processing(github, { interest: first.interest, notices: first.notices }, live);

		expect(quiet.notices['github:a/boats'].fund).toMatchObject({ closed: '2026-10-31', count: 1 });

		author.calls.length = 0;

		const next = await processing(github, { interest: quiet.interest, notices: quiet.notices }, live);

		expect(next.notices).toEqual(quiet.notices);
		expect(author.calls).toEqual([]);
	});

	test('that GitHub refuses is a failure the run reports, and the count is kept', async () => {
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(2, 'ann')] } });
		const refusing = async (method, path, body) => {
			if (method === 'POST' && !path.includes('/comments')) throw new Error('GitHub answered 403');

			return github.api(method, path, body);
		};
		const result = await processing(github, {}, { indexApi: refusing });

		expect(result.failures).toEqual(['github:a/boats fund: GitHub answered 403']);
		expect(result.interest['github:a/boats'].fund).toEqual(['ann']);
		expect(result.notices).toEqual({});
	});
});

describe('answering an ask', () => {
	test('comments its reply and closes it: done when counted, not planned when not', async () => {
		const github = fakeGithub({ issues: { [INDEX]: [askIssue(2, 'ann'), askIssue(3, 'bo', 'fund', 'not a mod')] } });
		const result = await processing(github);

		await reply({ indexApi: github.api, replies: result.replies });

		const [counted, refused] = github.repos[INDEX];

		expect(counted).toMatchObject({ state: 'closed', state_reason: 'completed' });
		expect(refused).toMatchObject({ state: 'closed', state_reason: 'not_planned' });
		expect(refused.comments[0]).toContain('Edit the issue and reopen it');
	});
});
