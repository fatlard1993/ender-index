import { describe, expect, test } from 'bun:test';

import { donationsOf, lineOf } from '../src/modrinth';

describe("a Modrinth project's source link", () => {
	test('names the repository it is in, on each host the index crawls', () => {
		expect(lineOf('https://github.com/CaffeineMC/lithium')).toBe('CaffeineMC/lithium');
		expect(lineOf('https://github.com/Bestsoft101/SmallMods/tree/fastminecart')).toBe('Bestsoft101/SmallMods');
		expect(lineOf('https://www.github.com/a/b.git')).toBe('a/b');
		expect(lineOf('https://codeberg.org/enjarai/do-a-barrel-roll')).toBe('codeberg:enjarai/do-a-barrel-roll');
		expect(lineOf('https://gitlab.com/group/sub/project/-/tree/main')).toBe('gitlab:group/sub/project');
	});

	test('names nothing for another host, a profile, or what is not a link', () => {
		expect(lineOf('https://bitbucket.org/a/b')).toBeUndefined();
		expect(lineOf('https://github.com/someone')).toBeUndefined();
		expect(lineOf('not a link')).toBeUndefined();
	});
});

describe("a Modrinth project's donation links", () => {
	const kofi = { platform: 'ko_fi', url: 'https://ko-fi.com/maker' };
	const patreon = { platform: 'patreon', url: 'https://www.patreon.com/maker' };

	test('are its own, or when it gives none, those its owner gives on their other projects, marked as theirs', () => {
		const donations = donationsOf([
			{ line: 'maker/funded', owner: 'u1', links: [kofi] },
			{ owner: 'u1', links: [patreon, kofi] },
			{ line: 'maker/bare', owner: 'u1', links: [] },
		]);

		expect(donations.get('maker/funded')).toEqual([kofi]);
		expect(donations.get('maker/bare')).toEqual([
			{ ...kofi, from: 'modrinth-author' },
			{ ...patreon, from: 'modrinth-author' },
		]);
	});

	test('are none for a project an organization owns, or whose owner gives none anywhere', () => {
		const donations = donationsOf([
			{ line: 'org/funded', links: [kofi] },
			{ line: 'org/bare', links: [] },
			{ line: 'quiet/bare', owner: 'u2', links: [] },
		]);

		expect(donations.has('org/bare')).toBe(false);
		expect(donations.has('quiet/bare')).toBe(false);
	});
});
