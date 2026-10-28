import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { browser } from './dom';

let restore;
let maker;
let instances;
let local;

beforeAll(async () => {
	restore = browser();
	maker = await import('../client/packMaker');
	instances = await import('../client/InstancesPage');
	local = await import('../client/local');
});

afterAll(() => restore());

describe('making a pack', () => {
	test('names each mod as search writes it, and nothing it needs', () => {
		expect(
			maker.packOf({
				name: 'Family',
				minecraft: '26.3',
				loader: 'fabric',
				items: [
					{ host: 'github', repo: 'fatlard1993/big-boats' },
					{ host: 'codeberg', repo: 'someone/mod' },
					{ repo: 'CaffeineMC/sodium' },
				],
			}),
		).toEqual({
			name: 'Family',
			minecraft: '26.3',
			loader: 'fabric',
			mods: ['gh:fatlard1993/big-boats', 'cb:someone/mod', 'gh:CaffeineMC/sodium'],
		});
	});

	test("an instance takes a pack's name as one ender accepts, nothing a path could use", () => {
		expect(maker.instanceNameOf('Family Pack!')).toBe('family-pack');
		expect(maker.instanceNameOf('../../etc')).toBe('etc');
		expect(maker.instanceNameOf('   ')).toBe('pack');
		expect(maker.instanceNameOf('x'.repeat(80))).toHaveLength(64);
	});
});

describe('what the instances page says of a job', () => {
	test('is what it is doing while it runs, without the marks ender puts on its lines', () => {
		expect(
			instances.jobLine({ title: 'Importing gist:abc', state: 'running', lines: [':: Reading the pack', ''] }),
		).toBe('Importing gist:abc: Reading the pack');
		expect(instances.jobLine({ title: 'Updating family', state: 'running', lines: [] })).toBe(
			'Updating family: starting',
		);
		expect(instances.jobLine({ title: 'Updating family', state: 'done', code: 0, lines: ['ok 3 mods'] })).toBe(
			'Updating family: done',
		);
		expect(instances.jobLine(undefined)).toBe('');
	});

	test('is how it failed, in its own last words, when it did', () => {
		const failed = {
			title: 'Playing family',
			state: 'failed',
			code: 1,
			lines: [':: Starting', 'xx Java was not found'],
		};

		expect(instances.jobLine(failed)).toBe('Playing family failed (ender exited 1): Java was not found');
		expect(local.failureOf(failed)).toBe(
			'Playing family did not finish (ender exited 1): :: Starting\nxx Java was not found',
		);
		expect(local.failureOf({ ...failed, state: 'lost', error: 'ender web stopped answering' })).toBe(
			'ender web stopped answering',
		);
	});
});
