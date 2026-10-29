import { expect, test } from 'bun:test';

import { kindOf, similarPacks } from '../client/search';

test('a pack is like those sharing the most of its indexed mods, three at the least, and never like itself', () => {
	const pack = { host: 'github', repo: 'p/mine', matched: ['a', 'b', 'c', 'd'] };
	const packs = [
		pack,
		{ host: 'github', repo: 'p/close', matched: ['a', 'b', 'c', 'd', 'e'] },
		{ host: 'github', repo: 'p/big', matched: ['a', 'b', 'c', ...'fghijklmnop'] },
		{ host: 'github', repo: 'p/two', matched: ['a', 'b'] },
		{ host: 'gist', repo: 'p/mine', matched: ['a', 'b', 'c'] },
	];

	expect(similarPacks(pack, packs).map(({ other }) => `${other.host}:${other.repo}`)).toEqual([
		'github:p/close',
		'gist:p/mine',
		'github:p/big',
	]);
});

test("a pack's mod is told by the index having it, or else by where its jar is", () => {
	expect([{ key: 'github:a/b', jar: 'none' }, { jar: 'modrinth' }, { jar: 'none' }].map(kindOf)).toEqual([
		'indexed',
		'modrinth',
		'none',
	]);
});
