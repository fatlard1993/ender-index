/**
 * Libraries mods bundle under their own package names, by the package they keep: the ones findings most often come
 * from in the index, and the common ones beside them.
 */
const KNOWN = [
	'ch/qos/logback',
	'club/minnced',
	'com/alibaba/fastjson',
	'com/alibaba/fastjson2',
	'com/electronwill/nightconfig',
	'com/fasterxml/jackson',
	'com/github/benmanes/caffeine',
	'com/google/common',
	'com/google/gson',
	'com/google/protobuf',
	'com/ibm/icu',
	'com/jagrosh',
	'com/jcraft/jsch',
	'com/llamalad7/mixinextras',
	'com/mysql',
	'com/neovisionaries/ws',
	'com/rabbitmq',
	'com/squareup',
	'com/sun/jna',
	'com/zaxxer/hikari',
	'de/jcm',
	'io/grpc',
	'io/javalin',
	'io/netty',
	'io/sentry',
	'io/undertow',
	'it/unimi/dsi/fastutil',
	'javassist',
	'kotlin',
	'kotlinx',
	'net/bytebuddy',
	'net/dv8tion/jda',
	'net/kyori',
	'okhttp3',
	'okio',
	'org/apache',
	'org/bouncycastle',
	'org/bstats',
	'org/checkerframework',
	'org/eclipse/jetty',
	'org/eclipse/paho',
	'org/glassfish',
	'org/h2',
	'org/java_websocket',
	'org/jetbrains',
	'org/joml',
	'org/json',
	'org/luaj',
	'org/lwjgl',
	'org/mariadb',
	'org/mozilla/javascript',
	'org/objectweb/asm',
	'org/postgresql',
	'org/reflections',
	'org/slf4j',
	'org/sqlite',
	'org/tukaani',
	'org/xerial',
	'org/yaml/snakeyaml',
	'redis/clients/jedis',
];

/**
 * Folders a build moves a bundled library into under the mod's own package. A folder as plain as `lib` is left out:
 * it names a mod's own helpers as often as anything bundled, and calling a mod's own code a library would understate
 * what it reaches.
 */
const RELOCATED = new Set([
	'shadow',
	'shaded',
	'deps',
	'dependencies',
	'libs',
	'relocated',
	'repack',
	'repackaged',
	'thirdparty',
	'third_party',
	'vendor',
	'vendored',
]);

const knownIn = path => KNOWN.find(root => path === root || path.startsWith(`${root}/`));

/**
 * The library a class comes from, and whether that is certain: a jar the mod carries inside it is, by its file's name;
 * a package a well-known library keeps, or one a build relocated into a folder like `shadow` or `deps`, looks like one,
 * which is a guess a mod's own code could also fit. Undefined for code that looks like the mod's own.
 */
export const libraryOf = where => {
	if (where.includes('!')) return { name: where.split('!')[0].split('/').at(-1), certain: true };

	const parts = where.replace(/\.class$/, '').split('/');
	const marker = parts.findIndex((part, at) => at < parts.length - 2 && RELOCATED.has(part.toLowerCase()));

	if (marker !== -1) {
		const rest = parts.slice(marker + 1, -1);
		const known = rest.map((_, at) => knownIn(rest.slice(at).join('/'))).find(Boolean);

		return { name: (known ?? rest.slice(0, 2).join('/')).replaceAll('/', '.'), certain: false };
	}

	const known = knownIn(parts.slice(0, -1).join('/'));

	return known ? { name: known.replaceAll('/', '.'), certain: false } : undefined;
};
