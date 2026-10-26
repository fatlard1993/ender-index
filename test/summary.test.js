import { describe, expect, test } from 'bun:test';

import { LENGTH, readmeSummary, shorten, informative } from '../src/summary';

describe('a summary', () => {
	test("is not a template's description", () => {
		expect(informative('This is an example description! Tell everyone what your mod is about!')).toBe(false);
		expect(informative('A short description of your mod.')).toBe(false);
		expect(informative('${description}')).toBe(false);
		expect(informative('Mod')).toBe(false);
		expect(informative('Renders all modern fast seed cracking techniques infeasible.')).toBe(true);
	});

	test('is cut at a sentence near the limit, or at a word', () => {
		const sentences = `${'A'.repeat(120)} first. ${'b '.repeat(60)}`;

		expect(shorten(sentences)).toBe(`${'A'.repeat(120)} first.`);
		expect(shorten('word '.repeat(80)).endsWith('...')).toBe(true);
		expect(shorten('word '.repeat(80)).length).toBeLessThanOrEqual(LENGTH + 3);
		expect(shorten('short\n  and plain')).toBe('short and plain');
	});

	test("is a readme's first prose paragraph, past its headings, badges and images", () => {
		const readme = [
			'# Big Boats',
			'[![downloads](https://img.shields.io/x.svg)](https://example.com)',
			'<p align="center"><img src="logo.png"></p>',
			'```\ngradle build\n```',
			'It needs these to work:',

			'- not this list',
			'Ships you can **walk around on** while they sail, built from [any blocks](https://example.com/blocks).',
			'A later paragraph.',
		].join('\n\n');

		expect(readmeSummary(readme)).toBe('Ships you can walk around on while they sail, built from any blocks.');
		expect(readmeSummary('# Title\n\n![shot](a.png)\n\n| a | b |')).toBeNull();
	});
});
