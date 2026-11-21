import { describe, expect, test } from 'bun:test';

import { SCANNER_VERSION } from 'ender-launcher/scannerVersion';

import { RESCAN_SHARE, rescanner } from '../src/crawl';
import { INSPECTION, outdated, scannedBy, updateRecord } from '../src/record';

const repo = { full_name: 'a/mod', topics: [] };
const release = {
	tag_name: '1.0',
	published_at: '2026-10-01T00:00:00Z',
	prerelease: false,
	draft: false,
	assets: [{ name: 'mod.jar', id: 1, size: 10, browser_download_url: 'https://example.invalid/1' }],
};
const recordReadBy = version => ({
	repo: 'a/mod',
	releases: [
		{
			tag: '1.0',
			published: '2026-10-01T00:00:00Z',
			assets: [
				{
					id: 1,
					name: 'mod.jar',
					url: 'https://example.invalid/1',
					inspection: INSPECTION,
					sha256: 'same',
					scan: { capabilities: {}, ...(version ? { version } : {}) },
				},
			],
		},
	],
});

const reading = () => {
	const read = [];

	return {
		read,
		inspect: async ({ id }) => (
			read.push(id),
			{ sha256: 'same', mods: [], scan: { version: SCANNER_VERSION, capabilities: {} } }
		),
	};
};

describe('a jar an older scanner read', () => {
	test('says which scanner read it, the first for one read before scans said', () => {
		expect(scannedBy(recordReadBy(undefined).releases[0].assets[0])).toBe(1);
		expect(outdated(recordReadBy(undefined).releases[0].assets[0])).toBe(SCANNER_VERSION > 1);
		expect(outdated(recordReadBy(SCANNER_VERSION).releases[0].assets[0])).toBe(false);
	});

	test('keeps its findings unless a rescan asks, and then is read again with no change reported but the rescan', async () => {
		const left = reading();
		const kept = await updateRecord({
			record: recordReadBy(undefined),
			repo,
			releases: [release],
			now: 'now',
			inspect: left.inspect,
		});

		expect(left.read).toEqual([]);
		expect(kept.events).toEqual([]);

		const asked = reading();
		const rescanned = await updateRecord({
			record: recordReadBy(undefined),
			repo,
			releases: [release],
			now: 'now',
			inspect: asked.inspect,
			rescan: () => true,
		});

		expect(asked.read).toEqual([1]);
		expect(rescanned.record.releases[0].assets[0].scan.version).toBe(SCANNER_VERSION);
		expect(rescanned.events.map(({ type }) => type)).toEqual(['rescan']);
	});

	test('is read again by every crawl in a full rescan, by a share of them in a throttled one, and by none otherwise', () => {
		const full = rescanner('full');
		const throttled = rescanner('throttled', 2);
		const none = rescanner(undefined);

		expect([full(), full(), full()]).toEqual([true, true, true]);
		expect([throttled(), throttled(), throttled()]).toEqual([true, true, false]);
		expect(none()).toBe(false);
		expect(RESCAN_SHARE).toBeGreaterThan(0);
	});
});
