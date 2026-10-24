import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { readMods } from '../src/metadata';

let directory;
let counter = 0;

const jar = async files => {
	const staging = join(directory, `jar-${++counter}`);

	for (const [name, content] of Object.entries(files)) {
		await mkdir(dirname(join(staging, name)), { recursive: true });
		await writeFile(join(staging, name), content);
	}

	const archive = join(directory, `jar-${counter}.jar`);

	await Bun.spawn(['zip', '-qr', archive, '.'], { cwd: staging, stdout: 'ignore', stderr: 'ignore' }).exited;

	return archive;
};

beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), 'ender-index-'));
});

afterAll(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('mods declared in a built jar', () => {
	test('fabric', async () => {
		const path = await jar({
			'fabric.mod.json': JSON.stringify({
				id: 'modmenu',
				version: '22.0.0',
				name: 'Mod Menu',
				environment: 'client',
				depends: { fabricloader: '>=0.19.2', minecraft: ['1.21.1', '1.21.2'] },
			}),
		});

		expect(await readMods(path)).toEqual([
			{
				loader: 'fabric',
				id: 'modmenu',
				version: '22.0.0',
				name: 'Mod Menu',
				description: undefined,
				minecraft: '1.21.1 || 1.21.2',
				environment: 'client',
				depends: ['fabricloader', 'minecraft'],
			},
		]);
	});

	test('quilt', async () => {
		const path = await jar({
			'quilt.mod.json': JSON.stringify({
				quilt_loader: {
					id: 'q',
					version: '1.0',
					metadata: { name: 'Q' },
					depends: ['quilt_loader', { id: 'minecraft', versions: '>=1.20' }],
				},
			}),
		});
		const [mod] = await readMods(path);

		expect(mod).toMatchObject({
			loader: 'quilt',
			id: 'q',
			version: '1.0',
			name: 'Q',
			minecraft: '>=1.20',
			depends: ['quilt_loader', 'minecraft'],
		});
	});

	// The version placeholder is filled from the jar manifest at load time, so it is filled from there here.
	test('neoforge, with its version taken from the jar manifest', async () => {
		const path = await jar({
			'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nImplementation-Version: 3.0.5\n',
			'META-INF/neoforge.mods.toml': [
				'modLoader = "javafml"',
				'[[mods]]',
				'modId = "backpacked"',
				'version = "${file.jarVersion}"',
				'displayName = "Backpacked"',
				'[[dependencies.backpacked]]',
				'modId = "minecraft"',
				'type = "required"',
				'versionRange = "[1.21.1,1.21.2)"',
				'side = "BOTH"',
				'[[dependencies.backpacked]]',
				'modId = "jei"',
				'type = "optional"',
			].join('\n'),
		});

		expect(await readMods(path)).toEqual([
			{
				loader: 'neoforge',
				id: 'backpacked',
				version: '3.0.5',
				name: 'Backpacked',
				description: undefined,
				minecraft: '[1.21.1,1.21.2)',
				environment: '*',
				depends: ['minecraft'],
			},
		]);
	});

	test('a jar built for two loaders declares both', async () => {
		const path = await jar({
			'fabric.mod.json': JSON.stringify({ id: 'both', version: '1' }),
			'META-INF/mods.toml': 'modLoader = "javafml"\n[[mods]]\nmodId = "both"\nversion = "1"\n',
		});

		expect((await readMods(path)).map(mod => mod.loader)).toEqual(['fabric', 'forge']);
	});

	test('a jar that declares nothing holds no mods', async () => {
		expect(await readMods(await jar({ 'a/A.class': 'x' }))).toEqual([]);
	});
});
