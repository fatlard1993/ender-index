import { describe, expect, test } from 'bun:test';

import { fromGraphql } from '../src/graphqlRepos';
import { OPT_OUT, optedOutOn, optsOut, releaseOptsOut } from '../src/optOut';
import { crawlPack } from '../src/packs';
import { NOTES_KEPT, notesOf, updateRecord } from '../src/record';
import { sourceOf } from '../src/sources';
import { triage } from '../src/triage';

const repo = { full_name: 'a/mod', stargazers_count: 3, archived: false, topics: [] };

const release = (tag, body, day = 1) => ({
	tag_name: tag,
	published_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`,
	prerelease: false,
	draft: false,
	body,
	opted_out: releaseOptsOut(body),
	assets: [{ name: `mod-${tag}.jar`, id: day, size: 10, browser_download_url: `https://example.invalid/${day}` }],
});

const inspector = () => {
	const seen = [];

	return { seen, inspect: async ({ id }) => (seen.push(id), { sha256: `hash-${id}`, mods: [], scan: {} }) };
};

describe('opting out', () => {
	test("is the topic on a repository, in any case, and the word anywhere in a release's notes", () => {
		expect(optsOut({ topics: ['minecraft', 'Ender-Index-Opt-Out'] })).toBe(true);
		expect(optsOut({ topics: ['minecraft'] })).toBe(false);
		expect(optsOut({})).toBe(false);
		expect(releaseOptsOut(`Fixes boats\n\n<!-- ${OPT_OUT} -->`)).toBe(true);
		expect(releaseOptsOut('Fixes boats')).toBe(false);
		expect(releaseOptsOut(undefined)).toBe(false);
	});

	test('leaves a repository alone for a week after it was seen opting out', () => {
		const now = Date.parse('2026-11-21T00:00:00Z');

		expect(optedOutOn('2026-11-18', now)).toBe(true);
		expect(optedOutOn('2026-11-10', now)).toBe(false);
		expect(optedOutOn(undefined, now)).toBe(false);
	});

	test('is read over GraphQL from the topics, and from notes past the length the crawl keeps of them', () => {
		const long = `${Array.from({ length: 400 }, (_, at) => `- change ${at}`).join('\n')}\n\n${OPT_OUT}`;
		const { repo: read, releases } = fromGraphql(
			{
				nameWithOwner: 'a/mod',
				repositoryTopics: { nodes: [{ topic: { name: OPT_OUT } }] },
				releases: {
					nodes: [
						{ tagName: '1.0', description: long, releaseAssets: { nodes: [] } },
						{ tagName: '0.9', description: 'Notes', releaseAssets: { nodes: [] } },
					],
				},
			},
			notesOf,
		);

		expect(long.length).toBeGreaterThan(NOTES_KEPT);
		expect(optsOut(read)).toBe(true);
		expect(releases.map(({ opted_out }) => opted_out)).toEqual([true, false]);
	});

	test('a release is never downloaded, and one recorded before is dropped from the record', async () => {
		const first = inspector();
		const before = await updateRecord({
			record: undefined,
			repo,
			releases: [release('1.1', 'More boats', 2), release('1.0', 'Boats', 1)],
			now: '2026-11-01T00:00:00Z',
			inspect: first.inspect,
		});

		expect(before.record.releases.map(({ tag }) => tag)).toEqual(['1.1', '1.0']);

		const second = inspector();
		const after = await updateRecord({
			record: before.record,
			repo,
			releases: [
				release('1.2', `Sinking boats\n\n${OPT_OUT}`, 3),
				release('1.1', `More boats\n${OPT_OUT}`, 2),
				release('1.0', 'Boats', 1),
			],
			now: '2026-11-21T00:00:00Z',
			inspect: second.inspect,
		});

		expect(second.seen).toEqual([]);
		expect(after.record.releases.map(({ tag }) => tag)).toEqual(['1.0']);
		expect(after.events).toEqual([{ type: 'left', repo: 'a/mod', tag: '1.1' }]);
	});

	test('a record whose every release opted out comes back as none, for the crawl to remove', async () => {
		const { record } = await updateRecord({
			record: undefined,
			repo,
			releases: [release('1.0', 'Boats')],
			now: '2026-11-01T00:00:00Z',
			inspect: inspector().inspect,
		});
		const after = await updateRecord({
			record,
			repo,
			releases: [release('1.0', `Boats\n${OPT_OUT}`)],
			now: '2026-11-21T00:00:00Z',
			inspect: inspector().inspect,
		});

		expect(after.record).toBeUndefined();
		expect(after.events).toEqual([{ type: 'left', repo: 'a/mod', tag: '1.0' }]);
	});

	test('a repository with only its source is not listed by it', () => {
		const answer = { nameWithOwner: 'a/boats', repositoryTopics: { nodes: [{ topic: { name: OPT_OUT } }] } };

		expect(sourceOf(answer)).toEqual({ why: 'opts out of the index' });
	});

	test('a pack repository loses its pack', async () => {
		const pack = await crawlPack('a/pack', {
			scratch: '/nonexistent',
			repository: async () => ({ full_name: 'a/pack', topics: [OPT_OUT] }),
			releases: async () => {
				throw new Error('an opted out pack is not read further');
			},
		});

		expect(pack).toBeUndefined();
	});

	test('triage does not look at a repository seen opting out this week', async () => {
		const asked = [];

		await triage({
			lines: ['a/out', 'a/back'],
			noJars: {},
			optedOut: { 'a/out': '2026-11-20', 'a/back': '2026-11-01' },
			now: Date.parse('2026-11-21T00:00:00Z'),
			ask: async query => (asked.push(query), {}),
			indexed: async () => false,
			log: () => {},
		});

		expect(asked.join(' ')).toContain('"back"');
		expect(asked.join(' ')).not.toContain('"out"');
	});
});
