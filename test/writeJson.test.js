import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { writeJson } from '../src/crawl';

test('a record is written whole through a file of its own, renamed into place, with nothing left beside it', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'ender-index-write-'));
	const path = join(directory, 'mods', 'a', 'b.json');

	try {
		await Promise.all(Array.from({ length: 10 }, (_, at) => writeJson(path, { at })));

		expect(typeof (await Bun.file(path).json()).at).toBe('number');
		expect(await readdir(join(directory, 'mods', 'a'))).toEqual(['b.json']);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
