import { describe, expect, test } from 'bun:test';

import { answerOf, packLineOf, submitPack } from '../src/submit';

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
