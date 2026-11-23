import { join } from 'node:path';

/**
 * When the crawl last looked at each repository's contributors, funding, pictures and counts, by its repos.txt line.
 * Kept apart from the records so a look that finds nothing new changes one short line here rather than rewriting a
 * whole record, and the record stays the same file it was.
 */
export const CHECKS = 'checks.json';

/** How often stars, download counts and the last push are taken again: new releases land every crawl regardless. */
export const COUNTS_EVERY = 24 * 60 * 60 * 1000;

/** The checks kept, as a map from each repository's line to the dates of its looks. */
export const readChecks = async data => {
	const file = Bun.file(join(data, CHECKS));

	return new Map(Object.entries((await file.exists()) ? await file.json() : {}));
};

/** checks.json as written: a repository to a line, so a crawl's looks change a few lines and git keeps only those. */
export const checksText = checks =>
	`{\n${[...checks]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([line, dates]) => `${JSON.stringify(line)}:${JSON.stringify(dates)}`)
		.join(',\n')}\n}\n`;

export const writeChecks = (data, checks) => Bun.write(join(data, CHECKS), checksText(checks));
