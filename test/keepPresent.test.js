import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { keepPresent } from '../src/crawl';

test('a file always asked for is written empty while it has nothing, and left as it is once it has', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'ender-present-'));
	const path = join(directory, 'explanations.json');

	try {
		await keepPresent(path, {});

		expect(await Bun.file(path).json()).toEqual({});

		await Bun.write(path, JSON.stringify({ 'github:a/b': { network: 'it checks for updates' } }));
		await keepPresent(path, {});

		expect(await Bun.file(path).json()).toEqual({ 'github:a/b': { network: 'it checks for updates' } });
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
