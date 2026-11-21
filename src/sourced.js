/** Source files whose name says which class is in them: Java's public classes must match their file's name. */
const JAVA = /\.java$/;

/** Languages that let one file hold any classes, so a file's name proves nothing of what a class came from. */
const LOOSE = /\.(kt|kts|scala|groovy)$/;

/** The most classes kept of one jar's unsourced ones: enough to look at, not a copy of the jar's listing. */
export const UNSOURCED_KEPT = 20;

/** A compiled entry as a class path, without a multi-release jar's version folder or its extension. */
const classPath = entry => entry.replace(/^META-INF\/versions\/\d+\//, '').replace(/\.class$/, '');

/** The class a compiled entry came from, as a path without its extension: an inner class's outer one. */
export const classOrigin = entry => classPath(entry).split('$')[0];

/** The names a class's source file could have: its own, then each class it is nested in, as `$` in a file name is legal. */
const fileNames = entry => {
	const parts = classPath(entry).split('$');

	return parts.map((_, at) => parts.slice(0, parts.length - at).join('$'));
};

const packageOf = path => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

/** A release's own classes: compiled entries outside the jars it bundles, and not module or package descriptors. */
const ownClasses = entries =>
	entries.filter(
		entry => entry.endsWith('.class') && !entry.includes('!') && !/(^|\/)(module|package)-info\.class$/.test(entry),
	);

/**
 * The classes of a release jar that the repository at its tag has no source for, in a package where it has source for
 * others: the place a class slipped into a build, rather than written, would sit. A package of a library bundled or
 * relocated into the jar has no source at all, so it is not judged; nor is one written in a language whose files may
 * hold any classes.
 */
export const unsourcedClasses = (entries, sourcePaths) => {
	const sources = sourcePaths.filter(path => JAVA.test(path) || LOOSE.test(path));
	const loose = sources.filter(path => LOOSE.test(path)).map(path => `/${path.slice(0, path.lastIndexOf('/'))}`);
	const looseIn = name => loose.some(directory => directory.endsWith(`/${name}`));
	const byName = Map.groupBy(sources, path => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, ''));
	const named = (className, language) =>
		(byName.get(className.slice(className.lastIndexOf('/') + 1)) ?? []).find(
			path => language.test(path) && `/${path.replace(language, '')}`.endsWith(`/${className}`),
		);
	const sourceFor = className =>
		named(className, JAVA) ?? (className.endsWith('Kt') ? named(className.slice(0, -2), LOOSE) : undefined);
	const classes = ownClasses(entries);
	const sourced = new Set();

	const hasSource = entry => fileNames(entry).some(sourceFor);

	for (const entry of classes) if (hasSource(entry)) sourced.add(packageOf(classOrigin(entry)));

	return classes.filter(entry => {
		const name = packageOf(classOrigin(entry));

		return sourced.has(name) && !looseIn(name) && !hasSource(entry);
	});
};

/** What a payload slipped into a build has to reach to do anything: the capabilities a generated class rarely has. */
const REACHING = ['network', 'exec', 'native', 'classloading'];

/**
 * Of the classes a release's source does not have, those that reach what a payload must: the network, other programs,
 * native code, or classes defined while running. A class a build generates, like a factory or a build constant, has
 * no source either, but reaches none of these, so those are what a player is told of.
 */
export const reachingUnsourced = (unsourced, scan) => {
	const reaching = new Set(REACHING.flatMap(capability => Object.keys(scan?.capabilities?.[capability] ?? {})));

	return unsourced.filter(entry => reaching.has(entry));
};

/** Where a GitHub release asset comes from: its repository and the tag it was published under. */
export const releaseOf = url => {
	const match = url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\//);

	return match ? { repo: match[1], tag: decodeURIComponent(match[2]) } : undefined;
};
