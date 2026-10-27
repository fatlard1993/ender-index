import { describe, expect, test } from 'bun:test';

import { FEWEST, coalesce, stem, tagsOf } from '../src/tags';

const tagNames = tags => [...tags.keys()].sort();

describe("a repository's own tags", () => {
	test('read what its jars add, the data they ship and its shaders, a plural as its singular', () => {
		const tags = tagsOf({
			contents: [{ names: { item: ['Ship Helm', 'Paddles'], entity: ['Ship'] }, data: ['worldgen'], shaders: true }],
		});

		expect(tagNames(tags)).toEqual(['helm', 'paddle', 'shader', 'ship', 'worldgen']);
		expect(tags.get('ship').from).toEqual(new Set(['content']));
		expect(stem('ponies')).toBe('pony');
		expect(stem('iris')).toBe('iris');
	});

	test('take a mod it needs or suggests only when that mod adds to the game, and never the platform', () => {
		const tags = tagsOf({
			mods: [{ id: 'addon', depends: ['create', 'fabric-api', 'cloth-config2'], suggests: ['modmenu', 'jei'] }],
			adds: id => ['create', 'jei'].includes(id),
		});

		expect(tagNames(tags)).toEqual(['create', 'jei']);
	});

	test('take a word only when more than one of its texts uses it, and no word that says nothing', () => {
		const tags = tagsOf({ texts: ['Backpacks for everyone', 'A simple mod that adds backpacks', 'Fabric mod'] });

		expect(tagNames(tags)).toEqual(['backpack']);
	});
});

describe("the index's themes", () => {
	const holding = (count, tags, from = 'content') =>
		Array.from({ length: count }, () => new Map(tags.map(tag => [tag, { weight: 3, from: new Set([from]) }])));

	test('merge the tags whose repositories coincide, named by the commonest, and drop the rare and the everywhere', () => {
		const repositories = [
			...holding(6, ['sword', 'pickaxe']),
			...holding(2, ['sword']),
			...holding(5, ['backpack']),
			...holding(FEWEST - 1, ['unique']),
			...holding(60, ['shared-by-all']),
			...holding(300, []),
		];
		const tagged = new Map(repositories.map((tags, at) => [`github:a/${at}`, tags]));

		for (const tags of tagged.values()) tags.set('shared-by-all', { weight: 3, from: new Set(['content']) });

		const { themes, each } = coalesce(tagged);

		expect(themes).toEqual([
			{ tag: 'sword', aliases: ['pickaxe'], count: 8 },
			{ tag: 'backpack', aliases: [], count: 5 },
		]);
		expect(each.get('github:a/0')).toEqual(['sword']);
		expect(each.get('github:a/9')).toEqual(['backpack']);
		expect(each.get('github:a/300')).toEqual([]);
	});
});
