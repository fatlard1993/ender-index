import { expect, test } from 'bun:test';

import { libraryOf } from '../client/libraries';

test('a jar the mod carries is a library it bundles, for certain, by its file name', () => {
	expect(libraryOf('META-INF/jars/sqlite-jdbc-3.46.jar!org/sqlite/util/OSInfo.class')).toEqual({
		name: 'sqlite-jdbc-3.46.jar',
		certain: true,
	});
});

test('a well-known library under its own package looks like one, which is a guess', () => {
	expect(libraryOf('org/sqlite/util/OSInfo.class')).toEqual({ name: 'org.sqlite', certain: false });
	expect(libraryOf('okhttp3/internal/connection/RealCall.class')).toEqual({ name: 'okhttp3', certain: false });
	expect(libraryOf('kotlinx/coroutines/Job.class')).toEqual({ name: 'kotlinx', certain: false });
});

test('a library a build moved under the mod is named by what follows the folder it moved into', () => {
	expect(libraryOf('net/opanel/deps/h2/util/Utils.class')).toEqual({ name: 'h2.util', certain: false });
	expect(libraryOf('de/bluecolored/shadow/org/apache/commons/io/IOUtils.class')).toEqual({
		name: 'org.apache',
		certain: false,
	});
	expect(libraryOf('shadow/archipelago/org/json/JSONObject.class')).toEqual({
		name: 'org.json',
		certain: false,
	});
});

test("leaves a mod's own code its own, even in a folder named lib or a class sitting in a shadow folder itself", () => {
	expect(libraryOf('com/boats/lib/Render.class')).toBeUndefined();
	expect(libraryOf('com/boats/shadow/Payload.class')).toBeUndefined();
	expect(libraryOf('com/boats/net/Updater.class')).toBeUndefined();
	expect(libraryOf('kotlinish/Thing.class')).toBeUndefined();
});
