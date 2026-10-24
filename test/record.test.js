import { describe, expect, test } from 'bun:test';

import { INSPECTION, WINDOW, updateRecord } from '../src/record';

const repo = { full_name: 'a/mod', stargazers_count: 3, archived: false, license: { spdx_id: 'MIT' } };

const asset = (name, id) => ({ name, id, size: 10, browser_download_url: `https://example.invalid/${id}/${name}` });

const release = (tag, assets, day = 1) => ({
	tag_name: tag,
	published_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`,
	prerelease: false,
	draft: false,
	assets,
});

/** Stands in for the download: the bytes of an asset are its id, unless told otherwise. */
const inspector = (hashes = {}) => {
	const seen = [];

	return {
		seen,
		inspect: async ({ id }) => {
			seen.push(id);

			return { sha256: hashes[id] ?? `hash-${id}`, mods: [], scan: { capabilities: {} } };
		},
	};
};

const update = (record, releases, inspect) =>
	updateRecord({ record, repo, releases, now: '2026-10-23T00:00:00Z', inspect });

describe('a repository record', () => {
	test('records each mod jar of a release, and only the mod jars', async () => {
		const { inspect } = inspector();
		const { record, events } = await update(
			undefined,
			[release('1.0', [asset('mod-1.0.jar', 1), asset('mod-1.0-sources.jar', 2), asset('notes.txt', 3)])],
			inspect,
		);

		expect(record.repo).toBe('a/mod');
		expect(record.license).toBe('MIT');
		expect(record.releases[0].assets.map(entry => entry.name)).toEqual(['mod-1.0.jar']);
		expect(events.map(event => event.type)).toEqual(['new']);
	});

	test('a repository with no jar in any release has no record', async () => {
		const { record } = await update(undefined, [release('1.0', [asset('notes.txt', 1)])], inspector().inspect);

		expect(record).toBeUndefined();
	});

	test('an asset already recorded is not downloaded again', async () => {
		const releases = [release('1.0', [asset('mod.jar', 1)])];
		const first = await update(undefined, releases, inspector().inspect);
		const again = inspector();
		const second = await update(first.record, releases, again.inspect);

		expect(again.seen).toEqual([]);
		expect(second.events).toEqual([]);
		expect(second.record.releases).toEqual(first.record.releases);
	});

	// The fractureiser shape: a release people already installed, changed underneath them.
	test('a re-upload with different bytes is reported and the old hash kept', async () => {
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], inspector().inspect);
		const second = await update(first.record, [release('1.0', [asset('mod.jar', 2)])], inspector().inspect);
		const [entry] = second.record.releases[0].assets;

		expect(second.events.map(event => event.type)).toEqual(['swapped']);
		expect(entry.sha256).toBe('hash-2');
		expect(entry.replaced).toEqual([{ id: 1, sha256: 'hash-1', until: '2026-10-23T00:00:00Z' }]);
	});

	test('an asset recorded by an older inspection is read again, without calling it a swap', async () => {
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], inspector().inspect);

		first.record.releases[0].assets[0].inspection = INSPECTION - 1;

		const again = inspector();
		const second = await update(first.record, [release('1.0', [asset('mod.jar', 1)])], again.inspect);

		expect(again.seen).toEqual([1]);
		expect(second.events).toEqual([]);
		expect(second.record.releases[0].assets[0].inspection).toBe(INSPECTION);
	});

	test('a re-upload of the same bytes is not news', async () => {
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], inspector().inspect);
		const second = await update(
			first.record,
			[release('1.0', [asset('mod.jar', 2)])],
			inspector({ 2: 'hash-1' }).inspect,
		);

		expect(second.events).toEqual([]);
		expect(second.record.releases[0].assets[0].replaced).toBeUndefined();
	});

	test('an asset deleted from its release is marked, not forgotten', async () => {
		const first = await update(
			undefined,
			[release('1.0', [asset('mod.jar', 1), asset('mod-extra.jar', 2)])],
			inspector().inspect,
		);
		const second = await update(first.record, [release('1.0', [asset('mod.jar', 1)])], inspector().inspect);

		expect(second.events.map(event => event.type)).toEqual(['gone']);
		expect(second.record.releases[0].assets.find(entry => entry.name === 'mod-extra.jar').gone).toBe(
			'2026-10-23T00:00:00Z',
		);
	});

	test('an asset that cannot be inspected is recorded with why, and not retried until it changes', async () => {
		const failing = async () => {
			throw new Error('download answered 502');
		};
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], failing);
		const again = inspector();

		await update(first.record, [release('1.0', [asset('mod.jar', 1)])], again.inspect);

		expect(first.events.map(event => event.type)).toEqual(['failed']);
		expect(first.record.releases[0].assets[0].error).toBe('download answered 502');
		expect(again.seen).toEqual([]);
	});

	test(`only the newest ${WINDOW} releases are watched, and older records are kept`, async () => {
		const many = Array.from({ length: WINDOW + 2 }, (_, index) =>
			release(`1.${index}`, [asset('mod.jar', 100 + index)], 20 - index),
		);
		const watcher = inspector();
		const { record } = await update(undefined, many, watcher.inspect);

		expect(watcher.seen).toHaveLength(WINDOW);
		expect(record.releases.map(entry => entry.tag)).toEqual(many.slice(0, WINDOW).map(entry => entry.tag_name));
	});

	test('does not change the record it was given', async () => {
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], inspector().inspect);
		const before = structuredClone(first.record);

		await update(first.record, [release('1.0', [asset('mod.jar', 2)])], inspector().inspect);

		expect(first.record).toEqual(before);
	});
});
