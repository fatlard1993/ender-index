import { describe, expect, test } from 'bun:test';

import { INSPECTION, VERSION_LIMIT, WINDOW, updateRecord, vanish, watchedReleases } from '../src/record';

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

	test('an asset whose metadata could not be read is read again, since the reader may have learned how', async () => {
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], async () => ({
			sha256: 'hash-1',
			metadataError: 'JSON Parse error',
		}));
		const again = inspector();
		const second = await update(first.record, [release('1.0', [asset('mod.jar', 1)])], again.inspect);

		expect(again.seen).toEqual([1]);
		expect(second.events).toEqual([]);
		expect(second.record.releases[0].assets[0].metadataError).toBeUndefined();
	});

	test('a jar the reader could not open is read again, and the reason it failed is reported', async () => {
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], async () => ({
			sha256: 'hash-1',
			error: 'Corrupt zip central directory',
		}));
		const again = inspector();
		const second = await update(first.record, [release('1.0', [asset('mod.jar', 1)])], again.inspect);

		expect(first.events[0]).toMatchObject({ type: 'failed', error: 'Corrupt zip central directory' });
		expect(again.seen).toEqual([1]);
		expect(second.record.releases[0].assets[0].error).toBeUndefined();
	});

	test('a download that failed is not tried again each crawl', async () => {
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], async () => {
			throw new Error('download answered 404');
		});
		const again = inspector();

		await update(first.record, [release('1.0', [asset('mod.jar', 1)])], again.inspect);

		expect(again.seen).toEqual([]);
	});

	test("a jar's download count is kept current without reading it again", async () => {
		const counted = (id, downloads) => ({ ...asset('mod.jar', id), download_count: downloads });
		const first = await update(undefined, [release('1.0', [counted(1, 5)])], inspector().inspect);
		const again = inspector();
		const second = await update(first.record, [release('1.0', [counted(1, 9)])], again.inspect);

		expect(first.record.releases[0].assets[0].downloads).toBe(5);
		expect(again.seen).toEqual([]);
		expect(second.record.releases[0].assets[0].downloads).toBe(9);
		expect(second.events).toEqual([]);
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

	test('a link edited to lead elsewhere under the same id is read again, and new bytes are a swap', async () => {
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], inspector().inspect);
		const edited = { ...asset('mod.jar', 1), browser_download_url: 'https://example.invalid/elsewhere/mod.jar' };
		const second = await update(first.record, [release('1.0', [edited])], inspector({ 1: 'hash-other' }).inspect);
		const [entry] = second.record.releases[0].assets;

		expect(second.events.map(event => event.type)).toEqual(['swapped']);
		expect(entry.url).toBe('https://example.invalid/elsewhere/mod.jar');
		expect(entry.replaced).toEqual([{ id: 1, sha256: 'hash-1', until: '2026-10-23T00:00:00Z' }]);
	});

	test('an asset that failed and now reads replaces nothing, since nothing could install it', async () => {
		const failing = async () => {
			throw new Error('Not a zip archive');
		};
		const first = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], failing);
		const fixed = { ...asset('mod.jar', 1), browser_download_url: 'https://example.invalid/raw/mod.jar' };
		const second = await update(first.record, [release('1.0', [fixed])], inspector().inspect);
		const [entry] = second.record.releases[0].assets;

		expect(second.events).toEqual([]);
		expect(entry.sha256).toBe('hash-1');
		expect(entry.error).toBeUndefined();
		expect(entry.replaced).toBeUndefined();
	});

	test('links to files of one name are recorded apart, and none is taken for a swap of another', async () => {
		const links = [
			{ ...asset('mod.jar', 1), browser_download_url: 'https://example.invalid/1.7/mod.jar' },
			{ ...asset('mod.jar', 2), browser_download_url: 'https://example.invalid/1.8/mod.jar' },
		];
		const first = await update(undefined, [release('1.0', links)], inspector().inspect);
		const again = inspector();
		const second = await update(first.record, [release('1.0', links)], again.inspect);

		expect(first.record.releases[0].assets.map(entry => entry.sha256)).toEqual(['hash-1', 'hash-2']);
		expect(again.seen).toEqual([]);
		expect(second.events).toEqual([]);

		const third = await update(second.record, [release('1.0', [links[1]])], inspector().inspect);

		expect(third.events.map(event => event.type)).toEqual(['gone']);
		expect(third.record.releases[0].assets.find(entry => entry.id === 1).gone).toBe('2026-10-23T00:00:00Z');
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

describe('a repository its host no longer has', () => {
	test('has its record marked once, and is news only then', async () => {
		const { record } = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], inspector().inspect);
		const first = vanish({ record, name: 'a/mod', now: '2026-10-25' });
		const again = vanish({ record: first.record, name: 'a/mod', now: '2026-10-26' });

		expect(first.record.gone).toBe('2026-10-25');
		expect(first.events).toEqual([{ type: 'vanished', repo: 'a/mod' }]);
		expect(again.record.gone).toBe('2026-10-25');
		expect(again.events).toEqual([]);
	});

	test('that was never recorded is not news', () => {
		expect(vanish({ record: undefined, name: 'a/mod', now: '2026-10-25' }).events).toEqual([]);
	});

	test('is recorded afresh, unmarked, when it comes back', async () => {
		const { record } = await update(undefined, [release('1.0', [asset('mod.jar', 1)])], inspector().inspect);
		const back = await update(
			vanish({ record, name: 'a/mod', now: '2026-10-25' }).record,
			[release('1.0', [asset('mod.jar', 1)])],
			inspector().inspect,
		);

		expect(back.record.gone).toBeUndefined();
	});
});

describe('the releases worth downloading', () => {
	const games = new Set(['26.3', '1.21.1', '1.20.1', '1.12.2']);
	const tags = list => list.map(entry => entry.tag_name);

	test('are the newest few, and the newest naming each game version', () => {
		const releases = [
			...Array.from({ length: WINDOW }, (_, index) =>
				release(`0.${200 - index}.0+26.3`, [asset(`api-0.${200 - index}.0+26.3.jar`, index)]),
			),
			release('0.116.7+1.21.1', [asset('api-0.116.7+1.21.1.jar', 10)]),
			release('0.116.6+1.21.1', [asset('api-0.116.6+1.21.1.jar', 11)]),
			release('mc1.20.1-0.92.2', [asset('api-0.92.2.jar', 12)]),
		];

		expect(tags(watchedReleases(releases, games))).toEqual([
			...tags(releases.slice(0, WINDOW)),
			'0.116.7+1.21.1',
			'mc1.20.1-0.92.2',
		]);
	});

	test('do not take a mod version that is no game version for one', () => {
		const releases = Array.from({ length: WINDOW + 3 }, (_, index) =>
			release(`v1.${index}.3`, [asset(`mod-1.${index}.3.jar`, index)]),
		);

		expect(watchedReleases(releases, games)).toHaveLength(WINDOW);
	});

	test(`stop adding game versions after ${VERSION_LIMIT}`, () => {
		const many = new Set(Array.from({ length: VERSION_LIMIT + 5 }, (_, index) => `1.${index}`));
		const releases = [...many].map((version, index) => release(`mod+${version}`, [asset(`mod+${version}.jar`, index)]));

		expect(watchedReleases(releases, many)).toHaveLength(VERSION_LIMIT);
	});
});
