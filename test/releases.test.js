import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { releasesPath, slimRecord, writeReleases } from '../src/releases';

const record = {
	repo: 'a/b',
	stars: 9,
	readme: 'long',
	releases: [
		{
			tag: '1.0',
			published: '2026-11-01T00:00:00Z',
			prerelease: false,
			notes: 'what changed',
			assets: [
				{
					id: 1,
					name: 'b-1.0.jar',
					url: 'https://x/b.jar',
					sha256: 'aa',
					size: 10,
					downloads: 99,
					scan: { classes: 3 },
					inspection: {},
					icon: 'i.png',
					funding: [],
					knownBad: 'steals logins',
					mods: [
						{
							id: 'b',
							name: 'B',
							description: 'does b',
							loader: 'fabric',
							minecraft: '~26.3',
							environment: '*',
							depends: ['fabric-api'],
						},
					],
				},
			],
		},
	],
};

describe("a record's releases file", () => {
	test('keeps what a launcher picks a jar by, and none of the notes, scans, counts or pictures', () => {
		expect(slimRecord({ ...record, gone: '2026-11-20' })).toEqual({
			gone: '2026-11-20',
			releases: [
				{
					tag: '1.0',
					published: '2026-11-01T00:00:00Z',
					prerelease: false,
					assets: [
						{
							id: 1,
							name: 'b-1.0.jar',
							url: 'https://x/b.jar',
							sha256: 'aa',
							size: 10,
							knownBad: 'steals logins',
							mods: [{ id: 'b', loader: 'fabric', minecraft: '~26.3', environment: '*', depends: ['fabric-api'] }],
						},
					],
				},
			],
		});
		expect(releasesPath('mods/codeberg.org/a/b.json')).toBe('releases/codeberg.org/a/b.json');
	});

	test('is written for a record whose releases changed or that has none, and removed with its record', async () => {
		const data = await mkdtemp(join(tmpdir(), 'ender-releases-'));
		const now = '2026-11-23T05:00:00.000Z';
		const seen = at => ({ entries: new Map([['mods/a/b.json', { print: 'p', at }]]) });

		try {
			const records = new Map([['mods/a/b.json', record]]);

			expect(await writeReleases(data, records, seen('2026-11-20T00:00:00.000Z'), now)).toEqual({
				written: 1,
				removed: 0,
			});
			expect(await Bun.file(join(data, 'releases/a/b.json')).json()).toEqual(slimRecord(record));

			// Unchanged and present: left as it is
			expect(await writeReleases(data, records, seen('2026-11-20T00:00:00.000Z'), now)).toEqual({
				written: 0,
				removed: 0,
			});
			expect(await writeReleases(data, records, seen(now), now)).toEqual({ written: 1, removed: 0 });

			expect(await writeReleases(data, new Map(), seen(now), now)).toEqual({ written: 0, removed: 1 });
			expect(await Bun.file(join(data, 'releases/a/b.json')).exists()).toBe(false);
		} finally {
			await rm(data, { recursive: true, force: true });
		}
	});
});
