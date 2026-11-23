/**
 * The version of the published data's shape. Fields are added without changing it; it goes up only for a change that
 * could break a consumer, such as a field removed, renamed or given another meaning, and the README's stability
 * policy says what comes before that.
 */
export const SCHEMA_VERSION = 1;

/** Each shape version's schemas keep their own folder, so version 1's addresses go on serving version 1. */
const SCHEMAS = `https://raw.githubusercontent.com/fatlard1993/ender-index/main/schemas/v${SCHEMA_VERSION}`;

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
		explanations: {
			path: 'explanations.json',
			schema: `${SCHEMAS}/explanations.schema.json`,
			description: "Authors' explanations of findings, by mod and finding; absent until one is approved",
		},
		packs: {
			path: 'packs.json',
			schema: `${SCHEMAS}/packs.schema.json`,
			description: 'One summary per listed pack',
		},
		packRecord: {
			path: 'packs/{owner}/{repo}.json',
			schema: `${SCHEMAS}/pack-record.schema.json`,
			description: 'A pack repository and the pack in each format it has; packs/gist/{id}.json for a pack in a gist',
		},
		packPage: {
			path: 'pack-pages/{owner}/{repo}.json',
			schema: `${SCHEMAS}/pack-page.schema.json`,
			description: 'A pack summary with every mod it names; pack-pages/gist/{owner}/{id}.json for a pack in a gist',
		},
		renames: {
			path: 'renames.json',
			schema: `${SCHEMAS}/renames.schema.json`,
			description: 'Renamed repositories, old name to new',
		},
	},
});
