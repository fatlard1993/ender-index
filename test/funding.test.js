import { describe, expect, test } from 'bun:test';

import { parseFunding, supportLinks } from '../src/funding';

describe('a FUNDING.yml', () => {
	test("names each platform's page for its handles, and custom addresses as they are", () => {
		const yaml = [
			'# These are supported funding model platforms',
			'',
			'github: [maker, "partner"]',
			'patreon: maker # the main one',
			'open_collective: # left empty',
			'ko_fi:',
			'  - maker',
			"custom: ['https://example.com/donate', https://example.org/tip]",
		].join('\n');

		expect(parseFunding(yaml)).toEqual([
			{ platform: 'github', url: 'https://github.com/sponsors/maker' },
			{ platform: 'github', url: 'https://github.com/sponsors/partner' },
			{ platform: 'patreon', url: 'https://www.patreon.com/maker' },
			{ platform: 'ko_fi', url: 'https://ko-fi.com/maker' },
			{ platform: 'custom', url: 'https://example.com/donate' },
			{ platform: 'custom', url: 'https://example.org/tip' },
		]);
	});

	test('takes nothing it cannot be sure is a link: an unknown key, a handle with a path or script, a non-web address', () => {
		const yaml = [
			'mystery: someone',
			'patreon: "a b"',
			'ko_fi: ../../evil',
			'custom: javascript:alert(1)',
			'custom: ["not a url"]',
		].join('\n');

		expect(parseFunding(yaml)).toEqual([]);
	});

	test('names a link once however often the file repeats it', () => {
		expect(parseFunding('github: maker\ngithub: [maker]')).toEqual([
			{ platform: 'github', url: 'https://github.com/sponsors/maker' },
		]);
	});
});

describe("a jar's links", () => {
	test('ask for support by the site they lead to, or by a key that says so', () => {
		expect(
			supportLinks([
				{ name: 'sources', url: 'https://github.com/a/m' },
				{ name: 'modmenu.discord', url: 'https://discord.gg/x' },
				{ name: 'modmenu.kofi', url: 'https://ko-fi.com/a' },
				{ name: 'homepage', url: 'https://github.com/sponsors/a' },
				{ name: 'modmenu.donate', url: 'https://example.com/give' },
				{ name: 'support', url: 'https://www.paypal.com/donate?id=1' },
				{ name: 'wiki', url: 'https://www.paypal.com/us/home' },
			]),
		).toEqual([
			{ platform: 'ko_fi', url: 'https://ko-fi.com/a' },
			{ platform: 'github', url: 'https://github.com/sponsors/a' },
			{ platform: 'custom', url: 'https://example.com/give' },
			{ platform: 'custom', url: 'https://www.paypal.com/donate?id=1' },
		]);
	});
});
