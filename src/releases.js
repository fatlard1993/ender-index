import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Where a record's releases alone are kept: beside the records, releases/ in place of mods/. */
export const releasesPath = recordPath => recordPath.replace(/^mods\//, 'releases/');

/** Of a jar, and of each mod it declares, what a launcher does not pick one by. */
const ASSET_LEFT_OUT = ['scan', 'inspection', 'downloads', 'funding', 'icon'];
const MOD_LEFT_OUT = ['description', 'name'];

const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

/**
 * A record as a launcher picks a jar by: whether it is gone, the source a build is made from, and its releases without
 * their notes, scans, counts or pictures. A third of the record's size, as the record also carries what the site shows.
 */
export const slimRecord = record => ({
	...(record.gone ? { gone: record.gone } : {}),
	...(record.source ? { source: record.source } : {}),
	releases: (record.releases ?? []).map(({ notes, ...release }) => ({
		...release,
		assets: (release.assets ?? []).map(asset => {
			const kept = without(asset, ASSET_LEFT_OUT);

			return kept.mods ? { ...kept, mods: kept.mods.map(mod => without(mod, MOD_LEFT_OUT)) } : kept;
		}),
	})),
});

/**
 * Each record's releases file, written for those whose releases changed in this listing or that have none yet, and
 * removed for records no longer kept. `records` is each record by its path under data/; `seen`, what tracking changes
 * saw, says which changed `now`.
 */
export const writeReleases = async (data, records, seen, now) => {
	let written = 0;

	for (const [path, record] of records) {
		const file = join(data, releasesPath(path));

		if (seen.entries.get(path)?.at !== now && (await Bun.file(file).exists())) continue;

		await mkdir(dirname(file), { recursive: true });
		await Bun.write(file, `${JSON.stringify(slimRecord(record), undefined, '\t')}\n`);
		written += 1;
	}

	let removed = 0;

	await mkdir(join(data, 'releases'), { recursive: true });

	for await (const found of new Bun.Glob('**/*.json').scan(join(data, 'releases'))) {
		if (records.has(`mods/${found}`)) continue;

		await rm(join(data, 'releases', found), { force: true });
		removed += 1;
	}

	return { written, removed };
};
