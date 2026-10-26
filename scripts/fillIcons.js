import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DATA, fillIcons, pruneIcons, recordFiles, writeJson } from '../src/crawl';
import { buildSearch } from '../src/search';

/** Read icons for every record at once, rather than as each nightly crawl reaches it. Only release downloads are made, which the GitHub rate limit does not count. */
const files = await recordFiles();
const scratch = await mkdtemp(join(tmpdir(), 'ender-icons-'));
const records = [];
let next = 0;
let read = 0;

const worker = async () => {
	while (next < files.length) {
		const file = files[next++];
		const record = await Bun.file(file).json();

		if ((await fillIcons(record, scratch)) > 0) {
			await writeJson(file, record);
			++read;
		}

		records.push(record);
	}
};

try {
	await Promise.all(Array.from({ length: Number(process.env.JOBS ?? 8) }, worker));
} finally {
	await rm(scratch, { recursive: true, force: true });
}

await writeJson(join(DATA, 'search.json'), buildSearch(records));
await pruneIcons(records);

console.log(
	`${read} of ${files.length} records read for an icon; ${buildSearch(records).filter(entry => entry.icon).length} have one`,
);
