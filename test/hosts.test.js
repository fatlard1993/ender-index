import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { DATA, parseLine, recordPath } from '../src/crawl';
import { assetOf } from '../src/gitlab';

describe('repositories on other hosts', () => {
	test('a line names its host, and a bare owner/repo is GitHub', () => {
		expect(parseLine('CaffeineMC/lithium')).toEqual({ host: 'github', name: 'CaffeineMC/lithium' });
		expect(parseLine('codeberg:enjarai/do-a-barrel-roll')).toEqual({
			host: 'codeberg',
			name: 'enjarai/do-a-barrel-roll',
		});
		expect(parseLine('gitlab:group/sub/project')).toEqual({ host: 'gitlab', name: 'group/sub/project' });
		expect(() => parseLine('sourcehut:a/b')).toThrow('Unknown host "sourcehut"');
	});

	test("each host's records live apart, where no GitHub owner can collide", () => {
		expect(recordPath({ host: 'github', name: 'a/b' })).toBe(join(DATA, 'mods', 'a/b.json'));
		expect(recordPath({ host: 'codeberg', name: 'a/b' })).toBe(join(DATA, 'mods', 'codeberg.org', 'a/b.json'));
		expect(recordPath({ host: 'gitlab', name: 'g/s/p' })).toBe(join(DATA, 'mods', 'gitlab.com', 'g/s/p.json'));
	});

	// GitLab names a link for display; the file it leads to is what says whether it is a jar.
	test('a GitLab release link is named by the file it leads to', () => {
		expect(
			assetOf({
				id: 1,
				name: 'Mod jar',
				url: 'https://x.invalid/a',
				direct_asset_url: 'https://cdn.example/v/autokey-1.1.2%2B1.20.6.jar',
			}),
		).toEqual({
			id: 1,
			name: 'autokey-1.1.2+1.20.6.jar',
			browser_download_url: 'https://cdn.example/v/autokey-1.1.2%2B1.20.6.jar',
		});
		expect(assetOf({ id: 2, name: 'Modrinth', url: 'https://modrinth.com/mod/x' }).name).toBe('x');
	});
});
