import { describe, expect, test } from 'bun:test';

import { classOrigin, reachingUnsourced, releaseOf, unsourcedClasses } from '../src/sourced';

describe('a release jar against its source', () => {
	const source = [
		'README.md',
		'src/main/java/com/boats/Boats.java',
		'src/main/java/com/boats/BoatEntity.java',
		'common/src/main/java/com/boats/net/Packets.java',
	];

	test("finds a class beside the mod's own that the repository at its tag has no source for", () => {
		expect(
			unsourcedClasses(
				[
					'com/boats/Boats.class',
					'com/boats/Boats$1.class',
					'com/boats/BoatEntity$Kind.class',
					'com/boats/Updater.class',
					'com/boats/net/Packets.class',
					'META-INF/versions/17/com/boats/Boats.class',
					'com/boats/package-info.class',
				],
				source,
			),
		).toEqual(['com/boats/Updater.class']);
	});

	test('leaves alone a library bundled or relocated into the jar, which has no source in any of its packages', () => {
		expect(
			unsourcedClasses(
				['com/boats/Boats.class', 'com/boats/shadow/okhttp3/Call.class', 'org/sqlite/JDBC.class'],
				source,
			),
		).toEqual([]);
	});

	test('does not judge a package written in a language whose files may hold any classes', () => {
		expect(
			unsourcedClasses(
				['com/kt/Mod.class', 'com/kt/ModKt.class', 'com/kt/Helper.class'],
				['src/main/kotlin/com/kt/Mod.kt', 'src/main/java/com/kt/Bridge.java', 'src/main/kotlin/com/kt/Helper2.kt'],
			),
		).toEqual([]);
	});

	test('does not judge a package whose Kotlin sits in a source root apart from its Java', () => {
		expect(
			unsourcedClasses(
				['com/boats/Boats.class', 'com/boats/Helpers.class'],
				['src/main/java/com/boats/Boats.java', 'src/main/kotlin/com/boats/Extensions.kt'],
			),
		).toEqual([]);
	});

	test('matches a class to a file named with its own $, as Mixin classes for inner classes often are', () => {
		expect(
			unsourcedClasses(
				['com/boats/Boats.class', 'com/boats/mixin/Raider$GoalMixin.class', 'com/boats/mixin/Plain.class'],
				[
					'src/main/java/com/boats/Boats.java',
					'src/main/java/com/boats/mixin/Raider$GoalMixin.java',
					'src/main/java/com/boats/mixin/Plain.java',
				],
			),
		).toEqual([]);
	});

	test('tells only of those that reach what a payload must, not a generated factory or build constant', () => {
		const unsourced = ['com/boats/BuildConfig.class', 'com/boats/Updater.class', 'com/boats/Boats_Factory.class'];
		const scan = {
			capabilities: {
				network: { 'com/boats/Updater.class': ['java/net/http/HttpClient.send in run'] },
				unsafe: { 'com/boats/Boats_Factory.class': [] },
			},
		};

		expect(reachingUnsourced(unsourced, scan)).toEqual(['com/boats/Updater.class']);
	});

	test('reads where an asset came from, and the class an inner one belongs to', () => {
		expect(releaseOf('https://github.com/a/boats/releases/download/v1.0%2B1.21/boats.jar')).toEqual({
			repo: 'a/boats',
			tag: 'v1.0+1.21',
		});
		expect(releaseOf('https://gitlab.com/a/boats/-/releases/v1/downloads/boats.jar')).toBeUndefined();
		expect(classOrigin('META-INF/versions/21/a/B$C$1.class')).toBe('a/B');
	});
});
