import { describe, expect, test } from 'bun:test';

import { packOrMods, readPasted } from '../client/pasted';
import { installAllCommand, installCommand } from '../client/search';

const INDEX = 'https://fatlard1993.github.io/ender-index';

describe('what a pasted text names', () => {
	test("reads the index's own pages and the add lines it writes", () => {
		const lithium = { repo: 'CaffeineMC/lithium' };
		const built = { repo: 'a/b', host: 'codeberg', fromSource: true };

		expect(readPasted(`${INDEX}/mod/github/CaffeineMC/lithium`).mods).toEqual(['gh:CaffeineMC/lithium']);
		expect(readPasted(`${INDEX}/#/mod/gitlab/group/sub/project`).mods).toEqual(['gl:group/sub/project']);
		expect(readPasted(installCommand(lithium)).mods).toEqual(['gh:CaffeineMC/lithium']);
		expect(readPasted(installAllCommand([lithium, built], { instance: 'suite' }))).toEqual({
			mods: ['gh:CaffeineMC/lithium', 'cb:a/b'],
			packs: [],
			unread: [],
		});
	});

	test("reads a pack's index page and its ender import line as a pack, whichever box it is pasted in", () => {
		expect(readPasted(`${INDEX}/pack/github/me/family-pack`).packs).toEqual(['gh:me/family-pack']);
		expect(readPasted('ender import gh:me/family-pack', { bare: 'mod' }).packs).toEqual(['gh:me/family-pack']);
		expect(readPasted('ender import gist:0123456789abcdef0123').packs).toEqual(['gist:0123456789abcdef0123']);
		expect(readPasted('ender import https://example.com/pack.mrpack').packs).toEqual([
			'https://example.com/pack.mrpack',
		]);
	});

	test('a bare spec or repository link is what the box it is pasted in expects', () => {
		expect(readPasted('gh:me/thing', { bare: 'mod' }).mods).toEqual(['gh:me/thing']);
		expect(readPasted('gh:me/thing', { bare: 'pack' }).packs).toEqual(['gh:me/thing']);
		expect(readPasted('https://github.com/CaffeineMC/sodium', { bare: 'mod' }).mods).toEqual(['gh:CaffeineMC/sodium']);
		expect(readPasted('https://gitlab.com/group/sub/project/-/releases', { bare: 'mod' }).mods).toEqual([
			'gl:group/sub/project',
		]);
	});

	test('reads Modrinth and CurseForge pages, one mod a line or many, and skips the flags and names of a line', () => {
		expect(
			readPasted(
				[
					'https://modrinth.com/mod/sodium',
					'https://www.curseforge.com/minecraft/mc-mods/jei',
					'ender new survival gh:a/b -m 26.3 --loader fabric',
					'  mr:iris  ',
				].join('\n'),
			).mods,
		).toEqual(['mr:sodium', 'cf:jei', 'gh:a/b', 'mr:iris']);
	});

	test('keeps what it cannot read, for the page to say, rather than dropping it', () => {
		expect(readPasted('lithium please').unread).toEqual(['lithium', 'please']);
		expect(readPasted('file:///etc/passwd').unread).toEqual(['file:///etc/passwd']);
	});
});

describe('the pack field', () => {
	test('imports one pack, moves mods to the list, and says why for anything else', () => {
		expect(packOrMods(`${INDEX}/pack/github/me/family-pack`)).toEqual({ pack: 'gh:me/family-pack' });
		expect(packOrMods('ender add gh:CaffeineMC/lithium').mods).toEqual(['gh:CaffeineMC/lithium']);
		expect(packOrMods('ender add gh:CaffeineMC/lithium').said).toContain('That is a mod, not a pack');
		expect(packOrMods('gh:a/b gh:c/d').said).toBe('That names 2 packs; import one at a time');
		expect(packOrMods('').said).toBe('Paste a pack first');
	});
});
