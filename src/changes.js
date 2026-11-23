import { join } from 'node:path';

/** What a launcher reads: the records whose releases changed lately, and when, so it asks only for those. */
export const CHANGES = 'changes.json';

/** What the lists last saw of each record's releases, to tell a change from a rewrite: the index's own. */
export const SEEN = 'releases-seen.txt';

/** How far back changes.json reaches: a launcher that last looked longer ago than this checks every record. */
export const CHANGES_WINDOW = 7 * 24 * 60 * 60 * 1000;

/** Of an asset, what changes without changing what a launcher installs: counts and the index's own findings. */
const UNRESOLVED = ['downloads', 'scan', 'inspection', 'icon', 'funding'];

/** What of a record a launcher resolves a jar by: whether it is gone, and its releases. */
export const releasesOf = record => ({
	gone: record.gone,
	releases: (record.releases ?? []).map(release => ({
		...release,
		assets: (release.assets ?? []).map(asset =>
			Object.fromEntries(Object.entries(asset).filter(([key]) => !UNRESOLVED.includes(key))),
		),
	})),
});

export const fingerprint = record =>
	new Bun.CryptoHasher('sha1')
		.update(JSON.stringify(releasesOf(record)))
		.digest('hex')
		.slice(0, 16);

/** A record that is gone from the index: its line stays, marked so, while changes.json reaches back to it. */
const REMOVED = '-';

/**
 * The seen file: a line naming since when changes have been tracked, then one per record, sorted, with its releases'
 * fingerprint and when they last changed, so two writers' lines merge as git merges lines. Undefined before the first.
 */
export const readSeen = async data => {
	const file = Bun.file(join(data, SEEN));

	if (!(await file.exists())) return undefined;

	const [head, ...lines] = (await file.text()).trim().split('\n');
	const entries = new Map();

	for (const line of lines) {
		const [path, print, at] = line.split(' ');

		if (path && print && at) entries.set(path, { print, at });
	}

	return { since: head.replace(/^since /, ''), entries };
};

export const seenText = ({ since, entries }) =>
	[
		`since ${since}`,
		...[...entries.keys()].sort().map(path => `${path} ${entries.get(path).print} ${entries.get(path).at}`),
	].join('\n') + '\n';

/**
 * Each record's releases as they are now against what was seen: a record whose fingerprint moved, a new one and one
 * removed are marked changed now. Before anything was seen, all is taken as it is, and tracking starts now.
 */
export const track = (seen, current, now, window = CHANGES_WINDOW) => {
	if (seen === undefined)
		return { since: now, entries: new Map([...current].map(([path, print]) => [path, { print, at: now }])) };

	const entries = new Map();

	for (const [path, print] of current) {
		const before = seen.entries.get(path);

		entries.set(path, before?.print === print ? before : { print, at: now });
	}

	for (const [path, before] of seen.entries) {
		if (current.has(path)) continue;

		const removed = before.print === REMOVED ? before : { print: REMOVED, at: now };

		if (Date.parse(now) - Date.parse(removed.at) < window) entries.set(path, removed);
	}

	return { since: seen.since, entries };
};

/**
 * changes.json: every record whose releases changed from `since` on, by the path a launcher reads it at, with when.
 * `since` is the window's start, or when tracking began if later; a launcher whose copy of a record is older than it
 * cannot tell from this file, and asks.
 */
export const changesOf = ({ since: tracked, entries }, now, window = CHANGES_WINDOW) => {
	const since = new Date(Math.max(Date.parse(tracked), Date.parse(now) - window)).toISOString();
	const records = {};

	for (const path of [...entries.keys()].sort()) {
		const { at } = entries.get(path);

		if (at > tracked && at >= since) records[path] = at;
	}

	return { since, generated: now, records };
};
