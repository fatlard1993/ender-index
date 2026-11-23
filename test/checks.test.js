import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { checksText, readChecks, writeChecks } from '../src/checks';
import { holdCounts } from '../src/record';

const DAY = 24 * 60 * 60 * 1000;

const record = (stars, downloads, pushed) => ({
	repo: 'a/b',
	stars,
	pushed,
	releases: [
		{ tag: '2', assets: [{ id: 2, name: 'new.jar', downloads: 1 }] },
		{ tag: '1', assets: [{ id: 1, name: 'old.jar', downloads }] },
	],
});

test("keeps a record's stars, last push and download counts until they are a day old, and lands a new release at once", () => {
	const recorded = { ...record(10, 100, '2026-11-21T00:00:00Z'), releases: [record(0, 100).releases[1]] };
	const fresh = record(12, 140, '2026-11-22T09:00:00Z');

	expect(holdCounts(fresh, recorded, '2026-11-22T06:00:00Z', '2026-11-22T10:00:00Z', DAY)).toBe(false);
	expect(fresh.stars).toBe(10);
	expect(fresh.pushed).toBe('2026-11-21T00:00:00Z');
	expect(fresh.releases[1].assets[0].downloads).toBe(100);
	// The release new since the record was written keeps what its host said
	expect(fresh.releases[0]).toEqual({ tag: '2', assets: [{ id: 2, name: 'new.jar', downloads: 1 }] });

	const later = record(12, 140, '2026-11-22T09:00:00Z');

	expect(holdCounts(later, recorded, '2026-11-21T06:00:00Z', '2026-11-22T10:00:00Z', DAY)).toBe(true);
	expect(later.stars).toBe(12);
	expect(later.releases[1].assets[0].downloads).toBe(140);

	// A repository seen for the first time, or with no counts noted yet, takes them now
	expect(holdCounts(record(1, 1), undefined, undefined, '2026-11-22T10:00:00Z', DAY)).toBe(true);
	expect(holdCounts(record(1, 1), recorded, undefined, '2026-11-22T10:00:00Z', DAY)).toBe(true);
});

test('keeps the dates of each look a repository to a line, and reads them back', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'checks-'));

	try {
		const checks = new Map([
			['z/last', { counts: '2026-11-22T10:00:00Z' }],
			['a/first', { contributors: '2026-11-20T00:00:00Z', funding: '2026-11-19T00:00:00Z' }],
		]);

		await writeChecks(directory, checks);

		expect(checksText(checks).split('\n')).toEqual([
			'{',
			'"a/first":{"contributors":"2026-11-20T00:00:00Z","funding":"2026-11-19T00:00:00Z"},',
			'"z/last":{"counts":"2026-11-22T10:00:00Z"}',
			'}',
			'',
		]);
		expect(await readChecks(directory)).toEqual(new Map([...checks].sort(([a], [b]) => a.localeCompare(b))));
		expect((await readChecks(join(directory, 'none'))).size).toBe(0);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
