import { expect, test } from 'bun:test';

import { releasedByPacks } from '../src/packs';

test('the repositories packs download release jars from, or name by spec, are each listed once', () => {
	const packs = [
		{
			formats: {
				packwiz: {
					mods: [
						{ file: 'a.jar', url: 'https://github.com/o/a/releases/download/v1/a.jar' },
						{ file: 'b.jar', url: 'https://cdn.modrinth.com/data/xyz/versions/1/b.jar' },
					],
				},
				ender: { mods: ['gh:o/c', 'mr:sodium', { spec: 'github:o/a' }] },
			},
		},
		{ formats: { ender: { mods: ['gh:o/c'] } } },
	];

	expect(releasedByPacks(packs)).toEqual(['o/a', 'o/c']);
});
