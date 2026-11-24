import { describe, expect, test } from 'bun:test';

import { modrinthProjects } from '../client/modrinthProjects';

const project = (slug, extra = {}) => ({
	id: `ID${slug}`,
	slug,
	title: `${slug} title`,
	description: `What ${slug} does`,
	icon_url: `https://cdn.modrinth.com/${slug}.png`,
	...extra,
});

describe("Modrinth's projects, as a page asks for them", () => {
	test('are asked for in one request a hundred, found by slug or by id, and none that Modrinth has not got', async () => {
		const asked = [];
		const ask = async url => {
			const ids = JSON.parse(decodeURIComponent(new URL(url).searchParams.get('ids')));

			asked.push(ids.length);

			return ids.filter(name => name !== 'gone-a').map(name => project(name.replace(/^IDx/, 'x')));
		};
		const names = [...Array.from({ length: 150 }, (_, at) => `a-${at}`), 'gone-a', 'IDxyz'];
		const found = await modrinthProjects(names, { ask });

		expect(asked).toEqual([100, 52]);
		expect(found.get('a-3')).toEqual({
			title: 'a-3 title',
			description: 'What a-3 does',
			icon: 'https://cdn.modrinth.com/a-3.png',
			slug: 'a-3',
		});
		expect(found.get('IDxyz').slug).toBe('xyz');
		expect(found.has('gone-a')).toBe(false);

		await modrinthProjects(['a-3', 'A-4'], { ask });

		expect(asked).toEqual([100, 52]);
	});

	test('come back empty, not failing, when Modrinth cannot be reached, and are asked for again the next time', async () => {
		const failing = async () => {
			throw new Error('offline');
		};

		expect((await modrinthProjects(['b-1'], { ask: failing })).size).toBe(0);
		expect((await modrinthProjects(['b-1'], { ask: async () => [project('b-1')] })).get('b-1').title).toBe('b-1 title');
	});

	test('are asked for once while an ask for the same names is still waiting', async () => {
		let asks = 0;
		let answer;
		const ask = () => {
			asks += 1;

			return new Promise(resolve => {
				answer = () => resolve([project('c-1')]);
			});
		};
		const first = modrinthProjects(['c-1'], { ask });
		const second = modrinthProjects(['c-1'], { ask });

		await Promise.resolve();
		answer();

		expect([(await first).get('c-1').slug, (await second).get('c-1').slug]).toEqual(['c-1', 'c-1']);
		expect(asks).toBe(1);
	});
});
