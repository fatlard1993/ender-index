import { describe, expect, test } from 'bun:test';

import { packsFrom } from '../src/discover';
import { buildPacks } from '../src/packs';

const entry = repo => ({ repo, host: 'github' });

const record = (repo, names) => ({ repo, host: 'github', releases: [{ assets: names.map(name => ({ name })) }] });

describe('the pack listing', () => {
	const entries = [entry('a/linked'), entry('b/named'), entry('c/filed'), entry('d/modrinth')];
	const records = [record('c/filed', ['filed-1.0.jar'])];
	const modrinthIds = { AANobbMI: 'd/modrinth', gone: 'z/not-indexed' };

	test('matches each mod by its link, its spec, its file name, and last its Modrinth project', () => {
		const [pack] = buildPacks(
			[
				{
					repo: 'p/pack',
					host: 'github',
					stars: 5,
					formats: {
						packwiz: {
							name: 'Pack',
							minecraft: '1.21.1',
							loader: 'fabric',
							mods: [
								{ file: 'x.jar', url: 'https://github.com/a/linked/releases/download/v1/x.jar' },
								{ file: 'filed-1.0.jar', url: 'https://example.invalid/filed-1.0.jar' },
								{ file: 'sodium.jar', modrinth: 'AANobbMI' },
								{ file: 'gone.jar', url: 'https://cdn.modrinth.com/data/gone/versions/1/gone.jar' },
								{ file: 'nobody.jar' },
							],
						},
					},
				},
			],
			entries,
			records,
			modrinthIds,
		);

		expect(pack).toMatchObject({
			name: 'Pack',
			count: 5,
			matched: ['github:a/linked', 'github:c/filed', 'github:d/modrinth'],
			install: 'ender import gh:p/pack',
			formats: ['packwiz'],
		});
	});

	test("is told by a pack's ender pack before its packwiz one, and by its .mrpack last, installed by its link", () => {
		const both = buildPacks(
			[
				{
					repo: 'p/both',
					host: 'github',
					formats: {
						mrpack: { name: 'Released', mods: [], url: 'https://github.com/p/both/releases/download/v1/p.mrpack' },
						ender: { name: 'Ender', minecraft: '26.3', loader: 'fabric', mods: [{ spec: 'gh:b/named' }] },
					},
				},
				{
					repo: 'p/released',
					host: 'github',
					formats: {
						mrpack: { name: 'Released', mods: [], url: 'https://github.com/p/released/releases/download/v1/r.mrpack' },
					},
				},
			],
			entries,
			records,
		);

		expect(both[0]).toMatchObject({ name: 'Ender', matched: ['github:b/named'], install: 'ender import gh:p/both' });
		expect(both[1].install).toBe('ender import https://github.com/p/released/releases/download/v1/r.mrpack');
	});

	test('takes from code search only the repositories whose pack file is at their root', () => {
		expect(
			packsFrom([
				{ path: 'pack.toml', repository: { full_name: 'a/root' } },
				{ path: 'Packwiz/26.3/pack.toml', repository: { full_name: 'b/nested' } },
			]),
		).toEqual(['a/root']);
	});
});
