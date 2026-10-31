import { describe, expect, test } from 'bun:test';

import {
	donationLinks,
	donationsByMod,
	fundingLinksOf,
	handleOf,
	linksOf,
	parseFunding,
	readmeSupport,
	supportLinks,
} from '../src/funding';

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

	test('is read the same with Windows line endings', () => {
		expect(parseFunding('github: neoforged\r\nko_fi:\r\n  - maker\r\n')).toEqual([
			{ platform: 'github', url: 'https://github.com/sponsors/neoforged' },
			{ platform: 'ko_fi', url: 'https://ko-fi.com/maker' },
		]);
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

describe("a Modrinth project's donation links", () => {
	test('are each a support link by the site they lead to, and any other web address is custom', () => {
		expect(
			donationLinks([
				'https://ko-fi.com/a',
				'https://www.patreon.com/a',
				'https://example.com/tip',
				'javascript:alert(1)',
			]),
		).toEqual([
			{ platform: 'ko_fi', url: 'https://ko-fi.com/a' },
			{ platform: 'patreon', url: 'https://www.patreon.com/a' },
			{ platform: 'custom', url: 'https://example.com/tip' },
		]);
	});

	test('are kept by the mod each project links as its source, named as the index names it', () => {
		const links = [{ platform: 'ko_fi', url: 'https://ko-fi.com/a' }];

		expect(
			Object.fromEntries(
				donationsByMod(
					new Map([
						['A/Mod', links],
						['codeberg:b/mod', links],
					]),
				),
			),
		).toEqual({
			'github:a/mod': links,
			'codeberg:b/mod': links,
		});
	});
});

describe("a readme's support links", () => {
	test('are its links to sites known for support, each once, badges and all', () => {
		const markdown = [
			'[![Patreon](https://img.shields.io/badge/patreon-x)](https://www.patreon.com/qouteall).',
			'Thanks to [Patbox](https://ko-fi.com/patbox), and see https://example.com/donate',
			'Again: https://www.patreon.com/qouteall',
		].join('\n');

		expect(readmeSupport(markdown)).toEqual([
			{ platform: 'patreon', url: 'https://www.patreon.com/qouteall' },
			{ platform: 'ko_fi', url: 'https://ko-fi.com/patbox' },
		]);
	});

	test('pass over an address that does not parse, as a readme shows a local server or a placeholder', () => {
		const markdown = 'Open `http://localhost:8080`, or http://[your-ip]:25575, then https://ko-fi.com/patbox';

		expect(readmeSupport(markdown)).toEqual([{ platform: 'ko_fi', url: 'https://ko-fi.com/patbox' }]);
		expect(supportLinks([{ name: 'website', url: 'https://sillyland.xyz (currently a honeypot)' }])).toEqual([]);
	});

	test("are a person's own when the handle is their login, whatever its case or separators", () => {
		const links = [
			{ platform: 'patreon', url: 'https://www.patreon.com/c/Some_One' },
			{ platform: 'github', url: 'https://github.com/sponsors/someone' },
			{ platform: 'ko_fi', url: 'https://ko-fi.com/someoneelse' },
		];

		expect(handleOf('https://www.patreon.com/cw/AmyMialee')).toBe('AmyMialee');
		expect(linksOf(links, 'SomeOne').map(({ url }) => url)).toEqual([
			'https://www.patreon.com/c/Some_One',
			'https://github.com/sponsors/someone',
		]);
	});
});

describe("GitHub's funding links", () => {
	test('lead a GitHub handle to its Sponsors page and keep only web addresses, each once', () => {
		expect(
			fundingLinksOf([
				{ platform: 'GITHUB', url: 'https://github.com/LatvianModder' },
				{ platform: 'PATREON', url: 'https://patreon.com/LatvianModder' },
				{ platform: 'PATREON', url: 'https://patreon.com/LatvianModder' },
				{ platform: 'CUSTOM', url: 'javascript:alert(1)' },
			]),
		).toEqual([
			{ platform: 'github', url: 'https://github.com/sponsors/LatvianModder' },
			{ platform: 'patreon', url: 'https://patreon.com/LatvianModder' },
		]);
	});
});
