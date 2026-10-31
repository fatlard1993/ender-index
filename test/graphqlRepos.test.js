import { afterEach, describe, expect, test } from 'bun:test';

import * as github from '../src/github';
import { assetIdOf, fromGraphql, repositoriesQuery } from '../src/graphqlRepos';
import { notesOf } from '../src/record';

const node = (name, extra = {}) => ({
	nameWithOwner: name,
	description: 'A mod',
	stargazerCount: 5,
	isArchived: false,
	isFork: false,
	parent: null,
	licenseInfo: { spdxId: 'MIT' },
	createdAt: '2020-01-01T00:00:00Z',
	pushedAt: '2026-10-01T00:00:00Z',
	releases: {
		nodes: [
			{
				tagName: '1.0',
				publishedAt: '2026-10-01T00:00:00Z',
				isPrerelease: false,
				isDraft: false,
				description: 'Notes',
				releaseAssets: {
					nodes: [
						{
							id: 'RA_kwDODWh2684o6_HX',
							name: 'mod.jar',
							size: 10,
							downloadUrl: 'https://x/mod.jar',
							downloadCount: 3,
						},
						{
							id: 'MDEyOlJlbGVhc2VBc3NldDEyMzQ=',
							name: 'LICENSE',
							size: 1,
							downloadUrl: 'https://x/L',
							downloadCount: 0,
						},
					],
				},
			},
		],
	},
	...extra,
});

describe('a repository read over GraphQL', () => {
	test('gives each asset the number REST gives it, from a current id or a legacy one', () => {
		expect(assetIdOf('RA_kwDODWh2684o6_HX')).toBe(686551511);
		expect(assetIdOf('MDEyOlJlbGVhc2VBc3NldDEyMzQ=')).toBe(1234);
	});

	test('is in the shapes REST answers in: no parent left out, an unmatched license as NOASSERTION, assets by name', () => {
		const { repo, releases } = fromGraphql(node('a/mod', { licenseInfo: { spdxId: null } }), notesOf);

		expect(repo).toEqual({
			full_name: 'a/mod',
			description: 'A mod',
			stargazers_count: 5,
			archived: false,
			license: { spdx_id: 'NOASSERTION' },
			created_at: '2020-01-01T00:00:00Z',
			pushed_at: '2026-10-01T00:00:00Z',
			parent: undefined,
			fork: false,
		});
		expect(releases[0].assets.map(asset => [asset.name, asset.id])).toEqual([
			['LICENSE', 1234],
			['mod.jar', 686551511],
		]);
		expect(releases[0]).toMatchObject({ tag_name: '1.0', prerelease: false, draft: false, body: 'Notes' });
		expect(
			fromGraphql(node('a/fork', { isFork: true, parent: { nameWithOwner: 'o/mod' } }), notesOf).repo,
		).toMatchObject({
			fork: true,
			parent: { full_name: 'o/mod' },
		});
	});
});

describe('the crawl reading repositories in batches', () => {
	const original = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = original;
		github.planRepositories([]);
		github.forgetCache();
	});

	const answering = (heavyOver = Infinity) => {
		const asked = [];

		return {
			asked,
			ask: async query => {
				const names = [...query.matchAll(/repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)].map(
					([, o, n]) => `${o}/${n}`,
				);

				asked.push(names);

				if (names.length > heavyOver) throw new Error('GitHub GraphQL: Resource limits for this query exceeded.');

				return Object.fromEntries(names.map((name, at) => [`r${at}`, name === 'a/gone' ? null : node(name)]));
			},
		};
	};

	test('answers from GraphQL, asking again in halves a batch GitHub finds too heavy, and sends nothing to REST', async () => {
		const names = Array.from({ length: github.REPOSITORY_BATCH }, (_, at) => `a/m${at}`);
		const { asked, ask } = answering(3);

		globalThis.fetch = async url => {
			throw new Error(`REST was asked for ${url}`);
		};
		github.planRepositories(names, { ask, keep: async () => {} });

		expect((await github.repository('A/M0')).full_name).toBe('a/m0');
		expect((await github.releases(`a/m${github.REPOSITORY_BATCH - 1}`))[0].tag_name).toBe('1.0');
		expect(asked[0]).toHaveLength(github.REPOSITORY_BATCH);
		expect(asked.every(batch => batch.length <= github.REPOSITORY_BATCH)).toBe(true);
		expect(
			asked
				.filter(batch => batch.length <= 3)
				.flat()
				.sort(),
		).toEqual([...names].sort());
	});

	test('leaves to REST a repository GraphQL found nothing for, a page past the first, and one not planned', async () => {
		const { ask } = answering();
		const rest = [];

		globalThis.fetch = async url => {
			rest.push(String(url).replace('https://api.github.com', ''));

			return new Response('[]', { status: 200 });
		};
		github.planRepositories(['a/here', 'a/gone'], { ask, keep: async () => {} });

		await github.releases('a/here');
		await github.releases('a/gone');
		await github.releases('a/here', 2);
		await github.releases('b/unplanned');

		expect(rest).toEqual([
			'/repos/a/gone/releases?per_page=30',
			'/repos/a/here/releases?per_page=30&page=2',
			'/repos/b/unplanned/releases?per_page=30',
		]);
	});
});

test('asks each repository by an alias it reads the answer back by', () => {
	expect(repositoriesQuery(['a/one', 'b/two'], 30)).toContain('r1: repository(owner: "b", name: "two")');
});
