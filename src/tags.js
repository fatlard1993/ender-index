/**
 * Words that say nothing about what a mod is: the commonest of English, and what every mod's text says of itself.
 * A theme has to be something a mod is about, so these are never one.
 */
const NOISE = new Set(
	`the and for with that this your you are from into its not but has have had any when will new use used uses using
	all can also more most much many some each every other others than then there here what which who whom whose how
	why where while about over under after before again once only very just like them they their theirs our ours out
	one two three first last same such both few lot lots way ways well get gets got make makes made making let lets
	allow allows allowed add adds added adding now still even ever never always often sometimes something anything
	nothing everything thing things stuff kind sort type types part parts set sets keep keeps take takes give gives
	put puts see seen show shows look looks find found work works working run runs running come comes go goes going
	need needs want wants try tries able unable without within through between around across along against during
	instead rather quite really simply simple small big little large great good better best bad worse old new newer
	own another whatever however also each per via etc yes off back down near far long short high low full empty
	mod mods modded modding minecraft mojang fabric forge quilt neoforge fabricmc loader version versions release
	releases update updates updated port ported fork forked based compatible compatibility compat support supports
	supported feature features featuring various extra additional improve improves improved improvement tweak tweaks
	fix fixes fixed bug bugs issue issues config configs configurable configuration option options setting settings
	player players game games server servers client clients side vanilla style custom customizable customisable
	java api library lib core common utility utilities util addon addons plugin plugins integration integrations
	mixin mixins minecraft's mod's it's don't can't won't isn't open source driven gameplay special friendly progression
	system systems advanced mode modes remove removes automatically automatic inspired unofficial legacy modern different
	provide provides addition change changes disable disables display displays list name names play data enable enables
	easy easily quick quickly fast faster lightweight useful nice cool fun random certain specific general basic
	official original another example template current default new standalone multi single able also block blocks
	item items world worlds entity entities`.split(/\s+/),
);

/** What every mod runs on or is built with, which says nothing of what it is about. */
const PLATFORM = /^(minecraft|java|fabricloader|fabric-loader|fabric-api|fabric|quilt_loader|quilted_fabric_api|qsl|forge|neoforge|javafml|fabric-.*-v\d|fabric-language-.*|.*config.*|.*-lib|.*lib|architectury.*|cloth.*|kotlin.*)$/;

/** A plural read as its singular, so a mod of `ships` and one of a `ship` share it. */
export const stem = word => {
	if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
	if (word.length > 3 && /[^siu]s$/.test(word)) return word.slice(0, -1);

	return word;
};

export const words = text =>
	(String(text ?? '').toLowerCase().match(/[a-z][a-z\d]{2,}/g) ?? [])
		.filter(word => !NOISE.has(word))
		.map(stem)
		.filter(word => !NOISE.has(word));

/** How much one kind of evidence counts towards a tag: what a jar adds most, a word in one text least. */
const WEIGHT = { content: 3, relation: 2, text: 1 };

/** Below this a tag is not a repository's: a word once in one text is a mention, not a theme. */
const ENOUGH = 2;

/** What a jar adds that is a theme by itself, by the data it ships. */
const SHIPS = { worldgen: 'worldgen', structure: 'structure', dimension: 'dimension', enchantment: 'enchantment' };

/**
 * A repository's own tags, each with how strongly its jars and texts back it and where that came from: the names of
 * what its jars add, the data they ship, the mods they need or suggest, and the words its texts use more than once.
 * A mod it needs or suggests is a theme only when `adds` says that mod adds to the game: one that adds nothing is
 * plumbing, which every kind of mod is built on.
 */
export const tagsOf = ({ mods = [], contents = [], texts = [], adds = () => false }) => {
	const tags = new Map();
	const back = (tag, from, weight = WEIGHT[from]) => {
		const kept = tags.get(tag) ?? { weight: 0, from: new Set() };

		kept.weight += weight;
		kept.from.add(from);
		tags.set(tag, kept);
	};

	for (const content of contents) {
		if (!content) continue;

		const named = new Set(Object.values(content.names ?? {}).flatMap(names => names.flatMap(words)));

		for (const word of named) back(word, 'content');
		for (const data of content.data ?? []) if (SHIPS[data]) back(SHIPS[data], 'content');
		if (content.names?.biome?.length) back('biome', 'content');
		if (content.shaders) back('shader', 'content');
	}

	const related = new Set(mods.flatMap(mod => [...(mod.depends ?? []), ...(mod.suggests ?? [])]));
	const own = new Set(mods.map(mod => mod.id));

	for (const id of related) if (!own.has(id) && !PLATFORM.test(id) && adds(id)) back(id.toLowerCase(), 'relation');

	for (const text of texts) for (const word of new Set(words(text))) back(word, 'text');

	return new Map([...tags].filter(([, { weight }]) => weight >= ENOUGH));
};

/** The fewest repositories a theme is shared by: fewer and it relates nothing, it only describes one mod. */
export const FEWEST = 4;

/** The largest share of the index a theme may cover: past it, it tells no mod apart. */
export const WIDEST = 0.06;

/** How much two tags' repositories have to coincide to be one theme under two names. */
export const TOGETHER = 0.5;

/** The most themes a repository is listed with, its best backed and rarest first. */
export const THEMES_EACH = 8;

/**
 * The themes a whole index's tags come down to. A tag shared by too few repositories or too many is dropped; tags
 * whose repositories mostly coincide are one theme, named by the most common of them. Each repository is given its
 * themes, best backed and rarest first, and each theme its other names and how many repositories it has.
 */
export const coalesce = tagged => {
	const holders = new Map();

	for (const [key, tags] of tagged) {
		for (const tag of tags.keys()) {
			if (!holders.has(tag)) holders.set(tag, new Set());

			holders.get(tag).add(key);
		}
	}

	const widest = Math.max(FEWEST, tagged.size * WIDEST);
	const kept = [...holders.keys()]
		.filter(tag => holders.get(tag).size >= FEWEST && holders.get(tag).size <= widest)
		.sort((a, b) => holders.get(b).size - holders.get(a).size || a.localeCompare(b));
	const named = new Map(kept.map(tag => [tag, tag]));
	const themeOf = tag => (named.get(tag) === tag ? tag : themeOf(named.get(tag)));

	for (const [at, tag] of kept.entries()) {
		for (const other of kept.slice(0, at)) {
			const [a, b] = [holders.get(tag), holders.get(other)];
			let both = 0;

			for (const key of a) if (b.has(key)) ++both;

			if (both / (a.size + b.size - both) >= TOGETHER) {
				named.set(themeOf(tag), themeOf(other));

				break;
			}
		}
	}

	const themes = new Map();

	for (const tag of kept) {
		const theme = themeOf(tag);
		const found = themes.get(theme) ?? { tag: theme, aliases: [], holders: new Set() };

		if (tag !== theme) found.aliases.push(tag);
		for (const key of holders.get(tag)) found.holders.add(key);
		themes.set(theme, found);
	}

	const rarity = theme => Math.log(tagged.size / themes.get(theme).holders.size);
	const each = new Map(
		[...tagged].map(([key, tags]) => {
			const scored = new Map();

			for (const [tag, { weight }] of tags) {
				if (!named.has(tag)) continue;

				const theme = themeOf(tag);

				scored.set(theme, Math.max(scored.get(theme) ?? 0, weight * rarity(theme)));
			}

			return [
				key,
				[...scored]
					.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
					.slice(0, THEMES_EACH)
					.map(([theme]) => theme),
			];
		}),
	);

	return {
		themes: [...themes.values()]
			.map(({ tag, aliases, holders: held }) => ({ tag, aliases, count: held.size }))
			.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
		each,
	};
};
