import { expect, test } from 'bun:test';

import { yourMods } from '../client/mine';

const entry = (repo, fields = {}) => ({ repo, host: 'github', ...fields });

test("an account's mods are listed with what each lacks and the asks for it, a draft note telling its author nothing", () => {
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
	});

	expect(mods.map(({ entry: { repo } }) => repo)).toEqual(['me/source', 'me/unpaid', 'Me/fine']);
	expect(mods[0].needs).toEqual([
		{ need: 'funding', asked: 2 },
		{ need: 'releases', asked: 1 },
	]);
	expect(mods[2].needs).toEqual([]);
});
