/**
 * The version of the published data's shape. Fields are added without changing it; it goes up only for a change that
 * could break a consumer, such as a field removed, renamed or given another meaning, and the README's stability
 * policy says what comes before that.
 */
export const SCHEMA_VERSION = 1;

const SCHEMAS = 'https://raw.githubusercontent.com/fatlard1993/ender-index/main/schemas';

/** data/index.json: the shape version, and each file a launcher reads, with its schema. */
export const manifest = () => ({
	schema: SCHEMA_VERSION,
	stability:
		'Fields are only added; ignore those you do not know. A change that could break a consumer raises schema, announced in the README at least 30 days ahead.',
	files: {
		search: {
			path: 'search.json',
			schema: `${SCHEMAS}/search.schema.json`,
			description: 'One summary per listed repository',
		},
		record: {
			path: 'mods/{owner}/{repo}.json',
			schema: `${SCHEMAS}/record.schema.json`,
			description:
				'A repository and its releases; mods/codeberg.org/{owner}/{repo}.json and mods/gitlab.com/{path}.json off GitHub',
		},
		knownBad: {
			path: 'known-bad.json',
			schema: `${SCHEMAS}/known-bad.schema.json`,
			description: 'Jars confirmed to do harm, by sha256; never install one',
		},
		withheld: {
			path: 'withheld.json',
			schema: `${SCHEMAS}/withheld.schema.json`,
			description: 'Repositories withheld as takedowns; already left out of every list',
		},
		optedOut: {
			path: 'opted-out.json',
			schema: `${SCHEMAS}/opted-out.schema.json`,
			description: 'Repositories that opted out; already left out of every list',
		},
		renames: {
			path: 'renames.json',
			schema: `${SCHEMAS}/renames.schema.json`,
			description: 'Renamed repositories, old name to new',
		},
	},
});
