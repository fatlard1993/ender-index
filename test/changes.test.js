import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { CHANGES_WINDOW, changesOf, fingerprint, readSeen, seenText, track } from '../src/changes';

const record = (assets, extra = {}) => ({
	repo: 'a/b',
	stars: 3,
	pushed: '2026-11-20T00:00:00Z',
	releases: [{ tag: '1.0', published: '2026-11-01T00:00:00Z', assets }],
	...extra,
});
const jar = extra => ({
	id: 1,
	name: 'b-1.0.jar',
	sha256: 'aa',
	url: 'https://x/b.jar',
	downloads: 10,
	mods: [],
	...extra,
});

describe("a record's releases", () => {
	test('are the same when only counts, the scan or the readme moved, and differ for anything a launcher installs by', () => {
		const before = fingerprint(record([jar()]));

		expect(fingerprint(record([jar({ downloads: 99, scan: { v: 3 } })], { stars: 40, readme: 'new' }))).toBe(before);

		for (const changed of [
			record([jar({ sha256: 'bb' })]),
			record([jar({ knownBad: 'steals logins' })]),
			record([jar(), jar({ id: 2, name: 'b-1.0-forge.jar' })]),
			record([jar()], { gone: '2026-11-22' }),
		]) {
			expect(fingerprint(changed)).not.toBe(before);
		}
	});
});

describe('tracking changes', () => {
	const at = hours => new Date(Date.parse('2026-11-23T00:00:00.000Z') + hours * 3_600_000).toISOString();

	test('starts with nothing changed, so the first file lists none rather than every record', () => {
		const seen = track(undefined, new Map([['mods/a/b.json', 'p1']]), at(0));

		expect(seen.since).toBe(at(0));
		expect(changesOf(seen, at(0))).toEqual({ since: at(0), generated: at(0), records: {} });
	});

	test('marks a changed, a new and a removed record when it saw them, and keeps when an unchanged one last changed', () => {
		const first = track(
			undefined,
			new Map([
				['mods/a/same.json', 's'],
				['mods/a/moves.json', 'm1'],
				['mods/a/goes.json', 'g'],
			]),
			at(0),
		);
		const second = track(
			first,
			new Map([
				['mods/a/same.json', 's'],
				['mods/a/moves.json', 'm2'],
				['mods/a/new.json', 'n'],
			]),
			at(5),
		);

		expect(changesOf(second, at(5)).records).toEqual({
			'mods/a/goes.json': at(5),
			'mods/a/moves.json': at(5),
			'mods/a/new.json': at(5),
		});
		expect(second.entries.get('mods/a/same.json').at).toBe(at(0));
		expect(changesOf(track(second, new Map([['mods/a/same.json', 's']]), at(9)), at(9)).records).toEqual({
			'mods/a/goes.json': at(5),
			'mods/a/moves.json': at(9),
			'mods/a/new.json': at(9),
		});
	});

	test('reaches back a week: older changes leave the file, and a removed record leaves the seen file too', () => {
		const week = CHANGES_WINDOW / 3_600_000;
		const first = track(undefined, new Map([['mods/a/goes.json', 'g']]), at(0));
		const removed = track(first, new Map([['mods/a/new.json', 'n']]), at(1));
		const later = track(removed, new Map([['mods/a/new.json', 'n']]), at(week + 2));
		const changes = changesOf(later, at(week + 2));

		expect(changes.since).toBe(at(2));
		expect(changes.records).toEqual({});
		expect(later.entries.has('mods/a/goes.json')).toBe(false);
		expect(later.entries.get('mods/a/new.json').at).toBe(at(1));
	});

	test('is kept a line a record, sorted, which reads back as it was written', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'ender-seen-'));
		const seen = track(
			track(undefined, new Map([['mods/z/z.json', 'z']]), at(0)),
			new Map([
				['mods/z/z.json', 'z'],
				['mods/a/a.json', 'a'],
			]),
			at(1),
		);

		try {
			await Bun.write(join(directory, 'releases-seen.txt'), seenText(seen));

			expect((await Bun.file(join(directory, 'releases-seen.txt')).text()).split('\n').slice(0, 3)).toEqual([
				`since ${at(0)}`,
				`mods/a/a.json a ${at(1)}`,
				`mods/z/z.json z ${at(0)}`,
			]);
			expect(await readSeen(directory)).toEqual(seen);
			expect(await readSeen(join(directory, 'none'))).toBeUndefined();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
