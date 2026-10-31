import { describe, expect, test } from 'bun:test';

import { CONTRIBUTORS_KEPT, contributorsOf, personFunding, rankContributors } from '../src/contributors';
import { RateLimited } from '../src/fetch';

const now = '2026-10-30T00:00:00.000Z';
const listed = [
	{ login: 'lead', type: 'User', contributions: 90 },
	{ login: 'renovate[bot]', type: 'Bot', contributions: 400 },
	{ login: 'helper', type: 'User', contributions: 10 },
];

describe("a repository's contributors", () => {
	test('are its people, the most commits first, bots left out, with the commits each share is of', () => {
		expect(rankContributors(listed)).toEqual({
			commits: 100,
			more: 0,
			people: [
				{ login: 'lead', commits: 90 },
				{ login: 'helper', commits: 10 },
			],
		});
	});

	test(`keep ${CONTRIBUTORS_KEPT} by name and count the rest`, () => {
		const many = Array.from({ length: CONTRIBUTORS_KEPT + 3 }, (_, at) => ({
			login: `p${at}`,
			type: 'User',
			contributions: 1,
		}));
		const ranked = rankContributors(many);

		expect(ranked.people).toHaveLength(CONTRIBUTORS_KEPT);
		expect(ranked.more).toBe(3);
		expect(ranked.commits).toBe(CONTRIBUTORS_KEPT + 3);
	});
});

describe("a contributor's funding", () => {
	test('is their FUNDING.yml, their GitHub Sponsors listing, and a support site their profile links', () => {
		expect(
			personFunding('lead', {
				hasSponsorsListing: true,
				websiteUrl: 'https://buymeacoffee.com/lead',
				account: { root: { text: 'ko_fi: lead' } },
			}),
		).toEqual([
			{ platform: 'ko_fi', url: 'https://ko-fi.com/lead' },
			{ platform: 'github', url: 'https://github.com/sponsors/lead' },
			{ platform: 'buy_me_a_coffee', url: 'https://buymeacoffee.com/lead' },
		]);
	});

	test('is none for a website that is not a support site, one with no scheme, or an account GitHub does not know', () => {
		expect(personFunding('a', { hasSponsorsListing: false, websiteUrl: 'https://a.example', account: null })).toEqual(
			[],
		);
		expect(personFunding('a', { hasSponsorsListing: false, websiteUrl: 'ko-fi.com/a', account: null })).toEqual([]);
		expect(personFunding('a', null)).toEqual([]);
	});

	test('names GitHub Sponsors once when the FUNDING.yml names it too', () => {
		expect(personFunding('lead', { hasSponsorsListing: true, account: { nested: { text: 'github: lead' } } })).toEqual([
			{ platform: 'github', url: 'https://github.com/sponsors/lead' },
		]);
	});
});

describe('reading contributors in a crawl', () => {
	const answering = users => {
		const queries = [];

		return {
			queries,
			ask: async query => {
				queries.push(query);

				return Object.fromEntries(
					[...query.matchAll(/(u\d+): user\(login: "([^"]+)"\)/g)].map(([, alias, login]) => [alias, users[login]]),
				);
			},
		};
	};

	test("asks each person's funding once a crawl, however many repositories they made", async () => {
		const { queries, ask } = answering({ lead: { hasSponsorsListing: true }, helper: null });
		const people = new Map();
		const list = async () => rankContributors(listed);

		const first = await contributorsOf({ name: 'a/one', now, people, list, ask });
		const second = await contributorsOf({ name: 'a/two', now, people, list, ask });

		expect(queries).toHaveLength(1);
		expect(first).toEqual({
			contributors: {
				commits: 100,
				more: 0,
				people: [
					{ login: 'lead', commits: 90, funding: [{ platform: 'github', url: 'https://github.com/sponsors/lead' }] },
					{ login: 'helper', commits: 10, funding: [] },
				],
			},
			contributorsChecked: now,
		});
		expect(second).toEqual(first);
	});

	test('are read again only after a week', async () => {
		const recorded = { contributors: { commits: 1, more: 0, people: [] }, contributorsChecked: now };
		let listings = 0;
		const list = async () => {
			listings += 1;

			return rankContributors([]);
		};

		expect(await contributorsOf({ name: 'a/b', recorded, now, people: new Map(), list })).toEqual(recorded);
		expect(listings).toBe(0);

		await contributorsOf({ name: 'a/b', recorded, now: '2026-11-07T00:00:00.000Z', people: new Map(), list });

		expect(listings).toBe(1);
	});

	test('keep what was known when the funding query fails, and ask it again for the next repository', async () => {
		const recorded = { contributors: { commits: 5, more: 0, people: [] }, contributorsChecked: '2026-01-01' };
		const people = new Map();
		const list = async () => rankContributors(listed);
		let asked = 0;
		const ask = async () => {
			asked += 1;

			throw new Error('GitHub GraphQL answered 502');
		};

		expect(await contributorsOf({ name: 'a/b', recorded, now, people, list, ask })).toEqual(recorded);
		await contributorsOf({ name: 'a/c', now, people, list, ask });

		expect(asked).toBe(2);
	});

	test("pass on the REST rate limit, so the crawl sets the repository aside, and keep what was known on GitHub's other failures", async () => {
		const limited = async () => {
			throw new RateLimited('limited', Date.now());
		};

		await expect(contributorsOf({ name: 'a/b', now, people: new Map(), list: limited })).rejects.toBeInstanceOf(
			RateLimited,
		);

		const recorded = { contributors: { commits: 5, more: 0, people: [] }, contributorsChecked: '2026-01-01' };
		const failing = async () => {
			throw Object.assign(new Error('GitHub 403 for /repos/a/b/contributors'), { status: 403 });
		};

		expect(await contributorsOf({ name: 'a/b', recorded, now, people: new Map(), list: failing })).toEqual(recorded);
	});
});
