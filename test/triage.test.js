import { describe, expect, test } from 'bun:test';

import { restingOn } from '../src/crawl';
import { RateLimited } from '../src/fetch';
import { BATCH, jarsIn, queryFor, triage } from '../src/triage';

const NOW = Date.parse('2026-10-28T00:00:00Z');

/** GraphQL as triage meets it: each repository answering with the asset names of its releases, or not at all. */
const answering = assets => async query => {
	const names = [...query.matchAll(/repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)].map(([, o, n]) => `${o}/${n}`);

	return Object.fromEntries(
		names.map((name, at) => [
			`r${at}`,
			name in assets
				? { releases: { nodes: [{ releaseAssets: { nodes: assets[name].map(asset => ({ name: asset })) } }] } }
				: null,
		]),
	);
};

const quiet = () => {};

describe('the triage', () => {
	test('asks after each repository by an alias it reads the answer back by', () => {
		const query = queryFor(['a/one', 'b/two']);

		expect(query).toContain('r0: repository(owner: "a", name: "one")');
		expect(query).toContain('r1: repository(owner: "b", name: "two")');
		expect(
			jarsIn({ r0: { releases: { nodes: [{ releaseAssets: { nodes: [{ name: 'Mod-1.0.JAR' }] } }] } }, r1: null }, [
				'a/one',
				'b/two',
			]),
		).toEqual(
			new Map([
				['a/one', true],
				['b/two', false],
			]),
		);
	});

	test('sets aside what has no jar, and leaves the crawl what has one, what is indexed, and what is not on GitHub', async () => {
		const asked = [];
		const ask = async query => {
			asked.push(query);

			return answering({ 'a/jars': ['mod.jar'], 'a/sources': ['src.zip'], 'a/was-none': ['mod.jar'] })(query);
		};
		const kept = await triage({
			lines: ['a/jars', 'a/sources', 'a/gone', 'a/indexed', 'codeberg:a/elsewhere', 'a/was-none', 'a/resting'],
			noJars: { 'a/was-none': '2026-08-01', 'a/resting': '2026-10-20' },
			now: NOW,
			ask,
			indexed: async name => name === 'a/indexed',
			log: quiet,
		});

		expect(kept).toEqual({ 'a/sources': '2026-10-28', 'a/gone': '2026-10-28', 'a/resting': '2026-10-20' });
		expect(asked.join(' ')).not.toContain('indexed');
		expect(asked.join(' ')).not.toContain('resting');
		expect(asked.join(' ')).not.toContain('elsewhere');
	});

	test(`asks ${BATCH} at a time, waits out GitHub's limit, and says what it could not ask about`, async () => {
		const lines = Array.from({ length: BATCH * 2 + 1 }, (_, at) => `a/repo${at}`);
		const logged = [];
		const waits = [];
		let calls = 0;
		const ask = async query => {
			calls++;

			if (calls === 1) throw new RateLimited("GitHub's GraphQL rate limit resets soon", Date.now() + 1000);
			if (query.includes('a/repo100') || query.includes('"repo100"')) throw new Error('GitHub GraphQL answered 502');

			return answering({})(query);
		};
		const kept = await triage({
			lines,
			noJars: {},
			now: NOW,
			ask,
			indexed: async () => false,
			parallel: 1,
			sleep: async ms => waits.push(ms),
			log: line => logged.push(line),
		});

		expect(waits).toHaveLength(1);
		expect(Object.keys(kept)).toHaveLength(BATCH * 2);
		expect(logged).toContain(
			`0 have jars to crawl, ${BATCH * 2} have none and are set aside for 30 days, 1 went unanswered`,
		);
		expect(logged.at(-1)).toBe('Not looked at, left for next time: a/repo100 and 0 more: GitHub GraphQL answered 502');
	});

	test('stops at its deadline, keeping what it knew and saying how many are left', async () => {
		const logged = [];
		const kept = await triage({
			lines: Array.from({ length: BATCH * 2 }, (_, at) => `a/repo${at}`),
			noJars: { 'old/one': '2026-10-20' },
			now: NOW,
			ask: answering({}),
			indexed: async () => false,
			deadline: Date.now() - 1,
			log: line => logged.push(line),
		});

		expect(kept).toEqual({ 'old/one': '2026-10-20' });
		expect(logged).toContain(`Out of time with ${BATCH * 2} left for next time`);
	});

	test('leaves a repository with no jar alone for thirty days, then looks again', () => {
		expect(restingOn('2026-10-01', NOW)).toBe(true);
		expect(restingOn('2026-09-27', NOW)).toBe(false);
		expect(restingOn(undefined, NOW)).toBe(false);
	});
});
