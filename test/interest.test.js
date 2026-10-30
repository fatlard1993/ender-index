import { describe, expect, test } from 'bun:test';

import { NEEDED, modOf, recordInterest } from '../src/interest';

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
	test('counts each player once, and at enough of them is the notice to its author, once', async () => {
		let state = {};
		const logins = ['ann', 'bo', 'ann', 'cy', 'di'];
		const results = [];

		for (const login of logins) {
			const result = await ask('release', login, state);

			state = { interest: result.interest, notices: result.notices };
			results.push(result);
		}

		expect(NEEDED).toBe(3);
		expect(results.map(result => result.notice !== undefined)).toEqual([false, false, false, true, false]);
		expect(results[3].notice).toMatchObject({ repo: { host: 'github', name: 'a/boats' } });
		expect(results[3].notice.title).toBe('3 players would like a built release of Big Boats');
		expect(results[3].notice.body).toContain('#/authors/releases');
		expect(results[4].say).toContain('Its author was told on 2026-10-29');
		expect(state.interest['github:a/boats'].release).toEqual(['ann', 'bo', 'cy', 'di']);
	});

	test('a funding notice links the guide to funding', async () => {
		const result = await ask('fund', 'cy', {
			record: released,
			interest: { 'github:a/boats': { fund: ['ann', 'bo'] } },
		});

		expect(result.notice.body).toContain('#/authors/funding');
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
