import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ICON_SIZE, fillIcons, fillJars, keepIcon, pruneIcons, shrinkIcon } from '../src/crawl';
import { summarize } from '../src/search';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A solid square PNG of the given width, built by hand so the test needs no image to be checked in. */
const square = width => {
	const chunk = (type, data) => {
		const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const length = Buffer.alloc(4);
		const crc = Buffer.alloc(4);

		length.writeUInt32BE(data.length);
		crc.writeUInt32BE(Bun.hash.crc32(body));

		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0xff)]);

	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(width, 4);
	header.set([8, 6, 0, 0, 0], 8);

	return Buffer.concat([
		SIGNATURE,
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: width }, () => row)))),
		chunk('IEND', Buffer.alloc(0)),
	]);
};

const PNG = square(16);
const PNG_NAME = `${new Bun.CryptoHasher('sha256').update(PNG).digest('hex')}.png`;

let directory;
let jars = 0;

const jar = async files => {
	const staging = join(directory, `staging-${++jars}`);

	for (const [name, bytes] of Object.entries(files)) {
		await mkdir(join(staging, name, '..'), { recursive: true });
		await writeFile(join(staging, name), bytes);
	}

	const path = join(directory, `mod-${jars}.jar`);

	await Bun.spawn(['zip', '-qr', path, '.'], { cwd: staging }).exited;

	return path;
};

const withIcon = () => jar({ 'fabric.mod.json': JSON.stringify({ id: 'a', icon: 'icon.png' }), 'icon.png': PNG });

const sha256 = async path => new Bun.CryptoHasher('sha256').update(await Bun.file(path).bytes()).digest('hex');

const recordOf = assets => ({
	repo: 'o/mod',
	releases: [
		{
			tag: '1.0',
			assets: assets.map((asset, index) => ({ id: index, name: `mod-${index}.jar`, mods: [{ id: 'a' }], ...asset })),
		},
	],
});

beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), 'ender-index-icons-'));
});

afterAll(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('icons', () => {
	test('are kept once by the hash of their bytes', async () => {
		const icons = join(directory, 'kept');

		expect(await keepIcon(await withIcon(), icons)).toBe(PNG_NAME);
		expect(await keepIcon(await withIcon(), icons)).toBe(PNG_NAME);
		expect(await readdir(icons)).toEqual([PNG_NAME]);
		expect(await keepIcon(await jar({ 'fabric.mod.json': '{"id":"b"}' }), icons)).toBe(null);
		expect(await keepIcon(join(directory, 'not-a-jar'), icons)).toBe(null);
	});

	test('are read for the listed release of a record read before them, once', async () => {
		const icons = join(directory, 'filled');
		const path = await withIcon();
		let asked = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () => {
				++asked;

				return new Response(Bun.file(path));
			},
		});
		const url = `http://localhost:${server.port}/mod.jar`;

		try {
			const record = recordOf([
				{ url, sha256: await sha256(path) },
				{ url, sha256: await sha256(path) },
			]);

			expect(await fillIcons(record, directory, icons)).toBe(1);
			expect(summarize(record).icon).toBe(PNG_NAME);
			expect(await fillIcons(record, directory, icons)).toBe(0);
			expect(asked).toBe(1);

			// Bytes other than those scanned are left for the crawl to read as a swap
			const swapped = recordOf([{ url, sha256: 'f'.repeat(64) }]);

			await fillIcons(swapped, directory, icons);
			expect(swapped.releases[0].assets[0].icon).toBe(undefined);
		} finally {
			server.stop();
		}
	});

	test('no record names are removed', async () => {
		const icons = join(directory, 'pruned');

		await mkdir(icons);
		await Promise.all(['kept.png', 'left.png'].map(name => writeFile(join(icons, name), PNG)));
		await pruneIcons([recordOf([{ icon: 'kept.png' }, { icon: null }])], icons);

		expect(await readdir(icons)).toEqual(['kept.png']);
	});

	test('larger than a page draws them are shrunk to fit, and smaller ones keep their bytes', async () => {
		const small = { type: 'png', bytes: square(16) };
		const large = await shrinkIcon({ type: 'png', bytes: square(512) });

		expect(await shrinkIcon(small)).toBe(small);
		expect(large.type).toBe('webp');
		expect(await new Bun.Image(large.bytes).metadata()).toMatchObject({ width: ICON_SIZE, height: ICON_SIZE });
	});

	test("support links, content and relations are read for the listed release's jars read before them, once", async () => {
		const path = await jar({
			'assets/a/lang/en_us.json': JSON.stringify({ 'item.a.paddle': 'Paddle' }),
			'fabric.mod.json': JSON.stringify({
				id: 'a',
				suggests: { modmenu: '*' },
				custom: {
					modmenu: { links: { 'modmenu.kofi': 'https://ko-fi.com/a', 'modmenu.discord': 'https://discord.gg/a' } },
				},
			}),
		});
		let asked = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () => {
				++asked;

				return new Response(Bun.file(path));
			},
		});

		try {
			const record = recordOf([{ url: `http://localhost:${server.port}/mod.jar`, sha256: await sha256(path) }]);

			await fillJars(record, directory);
			await fillJars(record, directory);

			const [asset] = record.releases[0].assets;

			expect(asset.funding).toEqual([{ platform: 'ko_fi', url: 'https://ko-fi.com/a' }]);
			expect(asset.content.names).toEqual({ item: ['Paddle'] });
			expect(asset.mods[0].suggests).toEqual(['modmenu']);
			expect(asked).toBe(1);
		} finally {
			server.stop();
		}
	});

	test('a jar read before breaks kept their ranges is read again for them, once, and nothing else is redone', async () => {
		const path = await jar({
			'fabric.mod.json': JSON.stringify({ id: 'a', breaks: { pandorical: '<15.0.0' } }),
		});
		let asked = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () => {
				++asked;

				return new Response(Bun.file(path));
			},
		});

		try {
			const record = recordOf([{ url: `http://localhost:${server.port}/mod.jar`, sha256: await sha256(path) }]);
			const [asset] = record.releases[0].assets;

			Object.assign(asset, { funding: [], content: { names: {} }, mods: [{ id: 'a', breaks: ['pandorical'] }] });
			await fillJars(record, directory);
			await fillJars(record, directory);

			expect(asset.mods[0].breaksVersions).toEqual({ pandorical: '<15.0.0' });
			expect(asset.content).toEqual({ names: {} });
			expect(asked).toBe(1);
		} finally {
			server.stop();
		}
	});
});
