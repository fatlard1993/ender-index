import { describe, expect, test } from 'bun:test';

import { answerOf, modLineOf, packLineOf, submitMod, submitPack } from '../src/submit';

const form = pack => `### Pack\n\n${pack}\n`;

describe('a submitted pack', () => {
	test('is named by a gist or a GitHub repository however it is written, and by nothing else', () => {
		const gist = '7e4eee2b11c998a93c0e3f661bb2a06c';

		for (const answer of [
			`gist:${gist}`,
			`https://gist.github.com/fatlard1993/${gist}`,
			`https://gist.github.com/${gist}/`,
		]) {
			expect(packLineOf(answer)).toBe(`gist:${gist}`);
		}

		for (const answer of [
			'p/pack',
			'gh:p/pack',
			'https://github.com/p/pack',
			'https://github.com/p/pack.git',
			' https://github.com/p/pack/#readme ',
		]) {
			expect(packLineOf(answer)).toBe('p/pack');
		}

		for (const answer of [
			'',
			'gist:xyz',
			'p',
			'p/pack/tree/main',
			'../..',
			'p/..',
			'https://gitlab.com/p/pack',
			'p/pack; rm -rf',
		]) {
			expect(packLineOf(answer)).toBeUndefined();
		}
	});

	test("is read from the issue form's answer, an unanswered field being none", () => {
		expect(answerOf(form('gh:p/pack'), 'Pack')).toBe('gh:p/pack');
		expect(answerOf(`${form('_No response_')}### Other\n\nx`, 'Pack')).toBeUndefined();
		expect(answerOf(undefined, 'Pack')).toBeUndefined();
	});

	test('that names no pack, or one holding none, is told why and left to be edited', async () => {
		const unread = await submitPack(form('not a pack'), { crawl: async () => undefined });

		expect(unread).toMatchObject({ listed: false });
		expect(unread.say).toStartWith('`not a pack` is not');

		const empty = await submitPack(form('p/empty'), { crawl: async () => undefined });

		expect(empty.listed).toBe(false);
		expect(empty.say).toStartWith('p/empty holds no pack');
	});
});

describe('a submitted mod', () => {
	const form = answer => `### Mod\n\n${answer}\n`;

	test('is named by its link on a host the index crawls, or owner/repo for GitHub', () => {
		expect(modLineOf('https://github.com/you/your-mod/tree/main')).toBe('you/your-mod');
		expect(modLineOf('https://codeberg.org/you/mod')).toBe('codeberg:you/mod');
		expect(modLineOf('https://gitlab.com/group/sub/mod/-/releases')).toBe('gitlab:group/sub/mod');
		expect(modLineOf(' gh:you/mod.git ')).toBe('you/mod');
		expect(modLineOf('you/mod')).toBe('you/mod');
		expect(modLineOf('https://example.com/you/mod')).toBeUndefined();
		expect(modLineOf('you/..')).toBeUndefined();
		expect(modLineOf('just a name')).toBeUndefined();
	});

	test('is crawled, listed, and kept for every crawl after', async () => {
		const kept = [];
		const crawled = [];
		const result = await submitMod(form('https://github.com/You/Mod'), {
			crawlOne: async line => {
				crawled.push(line);

				return 0;
			},
			listed: async () => ({ host: 'github', repo: 'You/Mod' }),
			keep: async line => kept.push(line),
		});

		expect(result.listed).toBe(true);
		expect(result.say).toStartWith('Listed: https://fatlard1993.github.io/ender-index/#/mod/github/You/Mod');
		expect(crawled).toEqual(['You/Mod']);
		expect(kept).toEqual(['You/Mod']);
	});

	test('that has no jar is told why and not kept; one whose crawl failed says so', async () => {
		const kept = [];
		const bare = await submitMod(form('you/bare'), {
			crawlOne: async () => 0,
			listed: async () => undefined,
			keep: async line => kept.push(line),
		});
		const failed = await submitMod(form('you/mod'), { crawlOne: async () => 1, listed: async () => undefined });
		const unread = await submitMod(form('not a repo'), { crawlOne: async () => 0 });

		expect(bare).toMatchObject({ listed: false });
		expect(bare.say).toStartWith('you/bare has no release with a mod jar');
		expect(kept).toEqual([]);
		expect(failed).toMatchObject({ listed: false, failed: true });
		expect(unread.say).toStartWith('`not a repo` is not');
	});
});
