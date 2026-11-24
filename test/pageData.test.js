import { describe, expect, test } from 'bun:test';

import {
	authorFile,
	authorFiles,
	pageDataFrom,
	pageDataIn,
	pageDataOf,
	pageDataScript,
	tileOf,
} from '../client/pageData';

const mod = (repo, extra = {}) => ({
	host: 'github',
	repo,
	stars: 1,
	targets: [{ loader: 'fabric', minecraft: '~26.3' }],
	latest: { tag: '1.0', mods: [{ id: repo.split('/')[1], name: repo, loader: 'fabric', minecraft: '~26.3' }] },
	...extra,
});

describe("a mod page's own data", () => {
	test('carries tiles holding only what a tile shows', () => {
		expect(tileOf(mod('a/b', { description: 'B', icon: 'b.png', funding: [{}], tags: ['x'] }))).toEqual({
			host: 'github',
			repo: 'a/b',
			stars: 1,
			icon: 'b.png',
			description: 'B',
			latest: { mods: [{ id: 'b', name: 'a/b' }] },
		});
	});

	test('holds the relations the page shows, the most starred six of each, and how many there are', () => {
		const lib = mod('a/lib', { stars: 50 });
		const users = Array.from({ length: 8 }, (_, at) => mod(`u${at}/app`, { stars: at, needs: ['github:a/lib'] }));
		const data = pageDataOf(lib, [lib, ...users, mod('a/other')]);

		expect(data.relations.needed.count).toBe(8);
		expect(data.relations.needed.tiles.map(tile => tile.repo)).toEqual([
			'u7/app',
			'u6/app',
			'u5/app',
			'u4/app',
			'u3/app',
			'u2/app',
		]);
		expect(data.author).toEqual({ count: 1 });
	});

	test('is carried in the page where nothing in it can close the script, and read back as it was, for its own mod alone', () => {
		const hostile = mod('a/b', { description: '</script><script>alert(1)</script>  ' });
		const data = pageDataOf(hostile, [hostile]);
		const script = pageDataScript(data);
		const inside = script.slice(script.indexOf('>') + 1, script.lastIndexOf('</script>'));

		expect(inside).not.toContain('<');
		expect(pageDataIn(`<html><head>${script}</head></html>`, { host: 'github', repo: 'a/b' })).toEqual(data);
		expect(pageDataIn(`<html><head>${script}</head></html>`, { host: 'github', repo: 'a/c' })).toBeUndefined();
		expect(pageDataIn('<html></html>', { host: 'github', repo: 'a/b' })).toBeUndefined();
		expect(pageDataFrom('not json', { host: 'github', repo: 'a/b' })).toBeUndefined();
	});

	test("keeps each owner's mods in a file named for them, and none for a name unsafe as a path", () => {
		expect(authorFile('github:fatlard1993')).toBe('authors/github/fatlard1993.json');
		for (const key of ['github:..', 'github:a/b', 'Gh1:x', 'github:']) expect(authorFile(key)).toBeUndefined();

		const files = authorFiles([mod('me/one', { stars: 1 }), mod('Me/two', { stars: 9 }), mod('you/x')]);

		expect([...files.keys()]).toEqual(['authors/github/me.json', 'authors/github/you.json']);
		expect(files.get('authors/github/me.json').map(tile => tile.repo)).toEqual(['Me/two', 'me/one']);
	});
});
