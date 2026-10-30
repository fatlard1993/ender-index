import { describe, expect, test } from 'bun:test';

import { MANIFESTS, RESULT_CAP, searchSlices, sliceQuery, startingSlices } from '../src/discover';
import { RateLimited } from '../src/fetch';
import { releasedByPacks } from '../src/packs';

const manifest = MANIFESTS[0];

/** A code search over files of these sizes, each in its own repository, answering a page of 100 at a time. */
const searchOver = sizes => {
	const asked = [];
	const search = async (query, page) => {
		asked.push(`${query} p${page}`);

		const [, from, to] = query.match(/size:(?:>=)?(\d+)(?:\.\.(\d+))?$/);
		const open = query.includes('>=');
		const matching = sizes
			.map((size, at) => ({ size, at }))
			.filter(({ size }) => size >= Number(from) && (open || size <= Number(to ?? from)));
		const items = matching
			.slice(0, RESULT_CAP)
			.slice((page - 1) * 100, page * 100)
			.map(({ at }) => ({ path: 'src/main/resources/fabric.mod.json', repository: { full_name: `o/r${at}` } }));

		return { total_count: matching.length, items };
	};

	return { search, asked };
};

const run = (state, search, deadline = Date.now() + 60_000) =>
	searchSlices({ state, search, deadline, sleep: async () => {}, log: () => {} });

describe('the code search for mod metadata', () => {
	test('asks each band by its file sizes, the last with no upper end', () => {
		expect(sliceQuery({ manifest, from: 500, to: 999 })).toBe(`${manifest} size:500..999`);
		expect(sliceQuery({ manifest, from: 7, to: 7 })).toBe(`${manifest} size:7`);
		expect(sliceQuery({ manifest, from: 2500, to: null })).toBe(`${manifest} size:>=2500`);
		expect(startingSlices().slices).toHaveLength(MANIFESTS.length * 5);
	});

	test('splits a band matching more than code search answers, until every file is found', async () => {
		const sizes = Array.from({ length: 2500 }, (_, at) => 500 + (at % 500));
		const { search } = searchOver(sizes);
		const { found, state } = await run({ next: 0, slices: [{ manifest, from: 500, to: 999 }] }, search);

		expect(found.size).toBe(2500);
		expect(state.slices.length).toBeGreaterThan(2);
		expect(state.slices.every(({ from, to }) => to >= from)).toBe(true);
		expect(state.slices.map(({ from }) => from)).toEqual(state.slices.map(({ from }) => from).toSorted((a, b) => a - b));
	});

	test('splits a band with no upper end at twice its start', async () => {
		const { search } = searchOver(Array.from({ length: 1500 }, (_, at) => 2500 + at * 3));
		const { found, state } = await run({ next: 0, slices: [{ manifest, from: 2500, to: null }] }, search);

		expect(found.size).toBe(1500);
		expect(state.slices[0]).toEqual({ manifest, from: 2500, to: 4999 });
		expect(state.slices.at(-1).to).toBeNull();
	});

	test('stops at its deadline, and the next night starts at the band it reached', async () => {
		const { search, asked } = searchOver([10, 600, 1200]);
		let now = 0;
		const state = {
			next: 1,
			slices: [
				{ manifest, from: 0, to: 499 },
				{ manifest, from: 500, to: 999 },
				{ manifest, from: 1000, to: null },
			],
		};
		const timed = async (query, page) => {
			now += 1;

			return search(query, page);
		};
		const realNow = Date.now;

		Date.now = () => now;

		try {
			const result = await run(state, timed, 2);

			expect(asked).toEqual([`${manifest} size:500..999 p1`, `${manifest} size:>=1000 p1`]);
			expect(result.state.next).toBe(0);
		} finally {
			Date.now = realNow;
		}
	});

	test('goes round the bands once at most', async () => {
		const { search, asked } = searchOver([10, 600]);

		await run(startingSlices(), search);

		expect(asked).toHaveLength(startingSlices().slices.length);
	});

	test('keeps what it found and where it was when the rate limit stops it', async () => {
		const { search } = searchOver([10, 600]);
		const limited = async (query, page) => {
			if (query.includes('500..999')) throw new RateLimited('code search is spent', 0);

			return search(query, page);
		};
		const result = await run({ next: 0, slices: startingSlices().slices.slice(0, 3) }, limited);

		expect([...result.found]).toEqual(['o/r0']);
		expect(result.state.next).toBe(1);
	});
});

test('the repositories packs download release jars from, or name by spec, are each listed once', () => {
	const packs = [
		{
			formats: {
				packwiz: {
					mods: [
						{ file: 'a.jar', url: 'https://github.com/o/a/releases/download/v1/a.jar' },
						{ file: 'b.jar', url: 'https://cdn.modrinth.com/data/xyz/versions/1/b.jar' },
					],
				},
				ender: { mods: ['gh:o/c', 'mr:sodium', { spec: 'github:o/a' }] },
			},
		},
		{ formats: { ender: { mods: ['gh:o/c'] } } },
	];

	expect(releasedByPacks(packs)).toEqual(['o/a', 'o/c']);
});
