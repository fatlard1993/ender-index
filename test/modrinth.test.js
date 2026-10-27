import { describe, expect, test } from 'bun:test';

import { lineOf } from '../src/modrinth';

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
