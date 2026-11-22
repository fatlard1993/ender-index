import { expect, test } from 'bun:test';

import { markKnownBad } from '../src/crawl';
import { buildSearch } from '../src/search';

const record = () => ({
	repo: 'a/mod',
	host: 'github',
	stars: 1,
	releases: [
		{
			tag: '1.0',
			prerelease: false,
			assets: [
				{
					name: 'mod.jar',
					sha256: 'bad',
					mods: [{ loader: 'fabric', id: 'mod', name: 'Mod', minecraft: '>=1.21', environment: '*', depends: [] }],
					scan: { capabilities: {} },
				},
				{ name: 'unread.jar', error: 'not a zip' },
			],
		},
	],
});

test('marks a jar read before its hash was listed as known bad, and clears the mark once the list drops it', () => {
	const kept = record();

	expect(markKnownBad(kept, new Map([['bad', 'steals session tokens']]))).toBe(true);
	expect(kept.releases[0].assets[0].knownBad).toBe('steals session tokens');
	expect(kept.releases[0].assets[1]).not.toHaveProperty('knownBad');
	expect(markKnownBad(kept, new Map([['bad', 'steals session tokens']]))).toBe(false);
	expect(markKnownBad(kept, new Map())).toBe(true);
	expect(kept.releases[0].assets[0]).not.toHaveProperty('knownBad');
});

test('lists the reason a newest release is known bad, for the search card and the page to say', () => {
	const kept = record();

	markKnownBad(kept, new Map([['bad', 'steals session tokens']]));

	expect(buildSearch([kept])[0].latest.knownBad).toEqual(['steals session tokens']);
	expect(buildSearch([record()])[0].latest).not.toHaveProperty('knownBad');
});
