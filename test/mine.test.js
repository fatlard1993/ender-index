import { expect, test } from 'bun:test';

import { yourMods } from '../client/mine';

const entry = (repo, fields = {}) => ({ repo, host: 'github', ...fields });

test("an account's mods are listed with what each lacks, the asks for it, and when its author was told", () => {
	const entries = [
		entry('Me/fine', { funding: [{ url: 'https://ko-fi.com/me' }] }),
		entry('me/unpaid'),
		entry('me/source', { fromSource: true }),
		entry('other/mod'),
		{ ...entry('me/elsewhere'), host: 'codeberg' },
	];
	const mods = yourMods({
		entries,
		login: 'ME',
		interest: { 'github:me/source': { fund: ['a', 'b'], release: ['a'] } },
		notices: {
			'github:me/source': {
				fund: { at: '2026-10-29', count: 3 },
				release: { at: '2026-10-30', count: 1, draft: true },
			},
		},
	});

	expect(mods.map(({ entry: { repo } }) => repo)).toEqual(['me/source', 'me/unpaid', 'Me/fine']);
	expect(mods[0].needs).toEqual([
		{ need: 'funding', asked: 2, told: '2026-10-29' },
		{ need: 'releases', asked: 1, told: undefined },
	]);
	expect(mods[2].needs).toEqual([]);
});
