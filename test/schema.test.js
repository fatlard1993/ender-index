import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import Ajv from 'ajv';

import { manifest, SCHEMA_VERSION } from '../src/manifest';

const root = join(import.meta.dir, '..');
const schema = async name => Bun.file(join(root, 'schemas', `v${SCHEMA_VERSION}`, name)).json();
const validator = async name => new Ajv({ allErrors: true }).compile(await schema(name));
const errorsOf = (validate, value) =>
	validate(value) ? [] : validate.errors.map(error => `${error.dataPath} ${error.message}`);

describe('the published schemas', () => {
	test("keep each version's schemas at their own addresses, so a later version never changes what an earlier one serves", async () => {
		for (const { schema: url } of Object.values(manifest().files)) {
			expect(url).toContain(`/schemas/v${SCHEMA_VERSION}/`);
		}
	});

	test('each is named by the URL the manifest gives it, and the manifest is valid by its own', async () => {
		const listed = manifest();

		for (const { schema: url } of Object.values(listed.files)) {
			expect((await schema(url.split('/').at(-1))).$id).toBe(url);
		}

		expect(listed.schema).toBe(SCHEMA_VERSION);
		expect(errorsOf(await validator('index.schema.json'), listed)).toEqual([]);
	});

	test('hold every record the index keeps', async () => {
		const validate = await validator('record.schema.json');
		const failures = [];

		for await (const file of new Bun.Glob('data/mods/**/*.json').scan(root)) {
			const errors = errorsOf(validate, await Bun.file(join(root, file)).json());

			if (errors.length > 0) failures.push(`${file}: ${errors.slice(0, 3).join('; ')}`);
		}

		expect(failures.slice(0, 10)).toEqual([]);
	}, 120_000);

	test('hold the search listing and the lists a launcher honors', async () => {
		for (const [file, name] of [
			['search.json', 'search.schema.json'],
			['known-bad.json', 'known-bad.schema.json'],
			['withheld.json', 'withheld.schema.json'],
			['opted-out.json', 'opted-out.schema.json'],
			['renames.json', 'renames.schema.json'],
			['explanations.json', 'explanations.schema.json'],
		]) {
			const published = Bun.file(join(root, 'data', file));

			// explanations.json is written with the first approved explanation
			if (file === 'explanations.json' && !(await published.exists())) continue;

			const errors = errorsOf(await validator(name), await published.json());

			expect({ file, errors: errors.slice(0, 5) }).toEqual({ file, errors: [] });
		}
	}, 60_000);

	test('refuse what a consumer relies on being absent or malformed', async () => {
		const record = await validator('record.schema.json');
		const knownBad = await validator('known-bad.schema.json');
		const asset = { id: 1, name: 'a.jar', url: 'https://example.com/a.jar', sha256: 'f'.repeat(64) };
		const valid = {
			repo: 'a/b',
			host: 'github',
			stars: 0,
			archived: false,
			created: '2026-01-01',
			pushed: '2026-01-01',
			releases: [{ tag: '1', published: '2026-01-01', prerelease: false, assets: [asset] }],
		};

		expect(errorsOf(record, valid)).toEqual([]);
		expect(errorsOf(record, { ...valid, host: 'example' })).not.toEqual([]);
		expect(
			errorsOf(record, { ...valid, releases: [{ ...valid.releases[0], assets: [{ ...asset, sha256: 'abc' }] }] }),
		).not.toEqual([]);
		expect(errorsOf(knownBad, [{ sha256: 'f'.repeat(64) }])).not.toEqual([]);

		const explanations = await validator('explanations.schema.json');
		const explained = {
			'github:a/b': {
				network: {
					text: 'It checks Modrinth for updates.',
					by: 'author',
					at: '2026-11-22T00:00:00Z',
					release: '1.0',
					covers: { calls: ['java/net/http/HttpClient.send'], hosts: ['api.modrinth.com'] },
					issue: 'https://github.com/fatlard1993/ender-index/issues/9',
				},
			},
		};

		expect(errorsOf(explanations, explained)).toEqual([]);
		expect(errorsOf(explanations, { 'github:a/b': { network: { text: 'x' } } })).not.toEqual([]);
	});
});
