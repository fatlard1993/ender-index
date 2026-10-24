import { listEntries, readEntry } from 'ender-launcher/archive';

const text = async (jar, name) => (await readEntry(jar, name))?.toString('utf8');

/** A line of a jar manifest, which wraps long values onto lines that begin with a space. */
const manifestValue = (manifest, key) => {
	const unwrapped = manifest.replaceAll(/\r?\n /g, '');

	return unwrapped.match(new RegExp(`^${key}: *(.*)$`, 'm'))?.[1]?.trim();
};

const fabric = (json, loader = 'fabric') => ({
	loader,
	id: json.id,
	version: json.version,
	name: json.name,
	description: json.description,
	minecraft: [json.depends?.minecraft].flat().filter(Boolean).join(' || ') || undefined,
	environment: json.environment ?? '*',
	depends: Object.keys(json.depends ?? {}),
});

const quilt = json => {
	const loader = json.quilt_loader ?? {};
	const depends = (loader.depends ?? []).map(dependency =>
		typeof dependency === 'string' ? { id: dependency } : dependency,
	);

	return {
		loader: 'quilt',
		id: loader.id,
		version: loader.version,
		name: loader.metadata?.name,
		description: loader.metadata?.description,
		minecraft:
			[depends.find(dependency => dependency.id === 'minecraft')?.versions].flat().filter(Boolean).join(' || ') ||
			undefined,
		environment: json.minecraft?.environment ?? '*',
		depends: depends.map(dependency => dependency.id),
	};
};

/**
 * Forge and NeoForge describe their mods in TOML, one jar sometimes carrying several. A version of
 * `${file.jarVersion}` is filled from the jar manifest at load time, so it is filled from there here.
 */
const toml = (source, loader, manifest) => {
	const parsed = Bun.TOML.parse(source);

	return (parsed.mods ?? []).map(mod => {
		const dependencies = parsed.dependencies?.[mod.modId] ?? [];
		const minecraft = dependencies.find(dependency => dependency.modId === 'minecraft');
		const version =
			mod.version === '${file.jarVersion}'
				? (manifestValue(manifest ?? '', 'Implementation-Version') ?? mod.version)
				: mod.version;

		return {
			loader,
			id: mod.modId,
			version,
			name: mod.displayName,
			description: mod.description?.trim(),
			minecraft: minecraft?.versionRange,
			environment: minecraft?.side?.toLowerCase() === 'client' ? 'client' : '*',
			depends: dependencies
				.filter(dependency => dependency.mandatory !== false && dependency.type !== 'optional')
				.map(dependency => dependency.modId),
		};
	});
};

/**
 * The mods a built jar says it holds. Read from the jar rather than the source tree, because only the
 * build has filled in the version and the game versions it supports.
 */
export const readMods = async jar => {
	const entries = new Set(await listEntries(jar));
	const manifest = entries.has('META-INF/MANIFEST.MF') ? await text(jar, 'META-INF/MANIFEST.MF') : undefined;
	const mods = [];

	if (entries.has('fabric.mod.json')) mods.push(fabric(JSON.parse(await text(jar, 'fabric.mod.json'))));
	if (entries.has('quilt.mod.json')) mods.push(quilt(JSON.parse(await text(jar, 'quilt.mod.json'))));
	if (entries.has('META-INF/neoforge.mods.toml'))
		mods.push(...toml(await text(jar, 'META-INF/neoforge.mods.toml'), 'neoforge', manifest));
	if (entries.has('META-INF/mods.toml')) mods.push(...toml(await text(jar, 'META-INF/mods.toml'), 'forge', manifest));

	return mods;
};
