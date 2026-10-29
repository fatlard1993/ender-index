import { describe, expect, test } from 'bun:test';

import { RateLimited } from '../src/fetch';
import { summarize } from '../src/search';
import { checkSources, gameVersionOf, queryFor, sourceOf, sourceRecord } from '../src/sources';

const fabricMod = fields => JSON.stringify({ id: 'boats', version: '${version}', depends: { minecraft: '~${minecraft_version}' }, ...fields });

const answer = (files = {}, fields = {}) => ({
	nameWithOwner: 'a/boats',
	description: 'Boats',
	stargazerCount: 3,
	isArchived: false,
	isFork: false,
	createdAt: '2025-01-01T00:00:00Z',
	pushedAt: '2026-10-01T00:00:00Z',
	licenseInfo: { spdxId: 'MIT' },
	defaultBranchRef: { target: { oid: 'c0ffee', committedDate: '2026-10-01T00:00:00Z' } },
	gradlew: { text: '#!/bin/sh' },
	properties: { text: 'minecraft_version=1.21.4\nmod_version=1.0.0' },
	settings: { text: "rootProject.name = 'boats'" },
	fabric: { text: fabricMod() },
	...files,
	...fields,
});

describe("a repository's source", () => {
	test('builds when it is one gradle project with its wrapper and its mod where the loader keeps it', () => {
		const { source } = sourceOf(answer());

		expect(source).toMatchObject({ commit: 'c0ffee', minecraft: '1.21.4', loader: 'fabric' });
		expect(source.mods[0]).toMatchObject({ id: 'boats', version: '1.0.0', minecraft: '~1.21.4' });
	});

	test('does not when a zip of it would not hold all it builds from', () => {
		expect(sourceOf(answer({ gradlew: null })).why).toBe('no gradle wrapper');
		expect(sourceOf(answer({ gitmodules: { text: '[submodule "x"]' } })).why).toContain('submodules');
		expect(sourceOf(answer({ settings: { text: "include ':lib'\nproject(':lib').projectDir = new File('../lib')" } })).why).toBe(
			'builds with projects outside it',
		);
	});

	test('does not when it is no named Minecraft mod of its own', () => {
		expect(sourceOf(answer({}, { isFork: true })).why).toContain('fork');
		expect(sourceOf(answer({ fabric: { text: fabricMod({ id: '${mod_id}' }) } })).why).toContain('filled in');
		expect(sourceOf(answer({ fabric: { text: fabricMod({ id: 'modid' }) } })).why).toContain('template');
		expect(
			sourceOf(answer({ properties: { text: '' }, fabric: { text: fabricMod({ depends: { cosmic_reach: '*' } }) } })).why,
		).toBe('names no Minecraft version');
	});
});

test('the game version comes from gradle.properties, or else from the range the mod gives Minecraft', () => {
	expect(gameVersionOf({ mc_version: '1.20.1' }, [])).toBe('1.20.1');
	expect(gameVersionOf({}, [{ depends: ['minecraft'], minecraft: '>=1.19.2' }])).toBe('1.19.2');
	expect(gameVersionOf({}, [{ depends: [], minecraft: undefined }])).toBeUndefined();
});

test('the query asks each repository for the files a build starts from', () => {
	expect(queryFor(['a/b'])).toContain('r0: repository(owner: "a", name: "b")');
	expect(queryFor(['a/b'])).toContain('object(expression: "HEAD:src/main/resources/fabric.mod.json")');
});

describe('checking sources', () => {
	const run = async ({ records = {}, checks = {}, ask }) => {
		const written = new Map();
		const removed = [];
		const kept = await checkSources({
			lines: Object.keys(records),
			checks,
			now: Date.parse('2026-10-29'),
			ask,
			recorded: async name => records[name] ?? undefined,
			write: async (name, record) => written.set(name, record),
			remove: async name => removed.push(name),
			log: () => {},
			sleep: async () => {},
		});

		return { kept, written, removed };
	};

	test('records a source that builds, and remembers one that does not', async () => {
		const { kept, written } = await run({
			records: { 'a/boats': null, 'a/none': null },
			ask: async () => ({ r0: answer(), r1: answer({ gradlew: null }, { nameWithOwner: 'a/none' }) }),
		});

		expect(written.get('a/boats')).toMatchObject({ repo: 'a/boats', releases: [], source: { commit: 'c0ffee' } });
		expect(kept['a/none']).toEqual({ checked: '2026-10-29', builds: false, why: 'no gradle wrapper' });
	});

	test('leaves alone what was looked at lately and what has releases', async () => {
		const asked = [];
		await run({
			records: { 'a/recent': null, 'a/released': { releases: [{}] } },
			checks: { 'a/recent': { checked: '2026-10-20', builds: false } },
			ask: async query => asked.push(query) && {},
		});

		expect(asked).toEqual([]);
	});

	test('drops the record of a source that stopped building', async () => {
		const { removed } = await run({
			records: { 'a/boats': { releases: [], source: { commit: 'old' } } },
			ask: async () => ({ r0: answer({ gradlew: null }) }),
		});

		expect(removed).toEqual(['a/boats']);
	});

	test('a batch GitHub fails is left for next time, and the rest are still asked', async () => {
		const lines = Object.fromEntries(Array.from({ length: 11 }, (_, at) => [`a/m${at}`, null]));
		let calls = 0;
		const { kept } = await run({
			records: lines,
			ask: async () => {
				if (calls++ === 0) throw new Error('GitHub GraphQL answered 502');

				return { r0: answer() };
			},
		});

		expect(calls).toBe(2);
		expect(kept['a/m0']).toBeUndefined();
		expect(kept['a/m10'].builds).toBe(true);
	});

	test('waits out a rate limit that resets in time', async () => {
		let calls = 0;
		const { written } = await run({
			records: { 'a/boats': null },
			ask: async () => {
				if (calls++ === 0) throw new RateLimited('limited', Date.now());

				return { r0: answer() };
			},
		});

		expect(written.has('a/boats')).toBe(true);
	});
});

test('a repository known only by its source is listed by it, marked so, with what its mods target', () => {
	const entry = summarize(sourceRecord(answer(), sourceOf(answer()).source, '2026-10-29'));

	expect(entry.fromSource).toBe(true);
	expect(entry.latest).toMatchObject({ tag: 'c0ffee', mods: [{ loader: 'fabric', id: 'boats', minecraft: '~1.21.4' }] });
	expect(entry.targets).toEqual([{ loader: 'fabric', minecraft: '~1.21.4' }]);
	expect(summarize({ ...sourceRecord(answer(), sourceOf(answer()).source), source: undefined }).latest).toBeUndefined();
});
