import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { dropWithheld } from '../src/crawl';
import { submitMod, submitPack } from '../src/submit';
import { readWithheld, withheldReason } from '../src/withheld';

test('reads the withheld list by repository, whatever the case it was written in', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'withheld-'));

	try {
		await Bun.write(join(directory, 'withheld.json'), JSON.stringify({ 'Some/Mod': 'a takedown notice, 2026-11-22' }));

		const withheld = await readWithheld(directory);

		expect(withheldReason(withheld, 'some/mod')).toBe('a takedown notice, 2026-11-22');
		expect(withheldReason(withheld, 'other/mod')).toBeUndefined();
		expect((await readWithheld(join(directory, 'none'))).size).toBe(0);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("removes a withheld repository's record and keeps the rest, a mod on any host as a pack", async () => {
	const directory = await mkdtemp(join(tmpdir(), 'withheld-'));

	try {
		const files = ['a.json', 'b.json', 'c.json', 'd.json'].map(name => join(directory, name));
		const records = [
			{ repo: 'Some/Mod', host: 'github' },
			{ repo: 'kept/mod', host: 'github' },
			{ repo: 'group/pack', host: 'gitlab' },
			{ repo: 'me/a1db98319884288ad3d83a0db854291f', host: 'gist' },
		];

		for (const file of files) await Bun.write(file, '{}');

		const kept = await dropWithheld(
			files,
			records,
			new Map([
				['some/mod', 'a takedown'],
				['gitlab:group/pack', 'a takedown'],
				['gist:a1db98319884288ad3d83a0db854291f', 'a takedown'],
			]),
		);

		expect(kept.records).toEqual([{ repo: 'kept/mod', host: 'github' }]);
		expect(kept.files).toEqual([files[1]]);
		expect(await Bun.file(files[0]).exists()).toBe(false);
		expect(await Bun.file(files[2]).exists()).toBe(false);
		expect(await Bun.file(files[3]).exists()).toBe(false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('a List a mod issue naming a withheld repository is told so and why, and nothing is crawled', async () => {
	const crawled = [];
	const result = await submitMod('### Mod\n\nhttps://github.com/Some/Mod', {
		crawlOne: async line => (crawled.push(line), 0),
		listed: async () => undefined,
		keep: async () => {},
		withheld: async () => new Map([['some/mod', 'a takedown notice, 2026-11-22']]),
	});

	expect(crawled).toEqual([]);
	expect(result).toEqual({ listed: false, say: 'Some/Mod is withheld from the index: a takedown notice, 2026-11-22' });
});

test('a List a pack issue naming a withheld pack is told so and why, and the pack is not read', async () => {
	const read = [];
	const result = await submitPack('### Pack\n\nhttps://github.com/Some/Pack', {
		crawl: async line => (read.push(line), undefined),
		withheld: async () => new Map([['some/pack', 'a takedown notice, 2026-11-22']]),
	});

	expect(read).toEqual([]);
	expect(result).toEqual({ listed: false, say: 'Some/Pack is withheld from the index: a takedown notice, 2026-11-22' });
});
