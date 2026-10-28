import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { browser } from './dom';

let restore;
let maker;
let instances;

beforeAll(async () => {
	restore = browser();
	maker = await import('../client/packMaker');
	instances = await import('../client/InstancesPage');
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

describe('what the instances page says ender did', () => {
	test("is ender's last verdict line, not every step it printed", () => {
		expect(
			instances.summaryOf(
				'ok Imported justfatpack-client :: Minecraft 26.3\n  game dir /x\n:: Syncing mods\n:: 8 mods in place',
			),
		).toBe('Imported justfatpack-client :: Minecraft 26.3');
		expect(instances.summaryOf('!! 1 mod did not update\nok Launched')).toBe('Launched');
		expect(instances.summaryOf(':: only steps')).toBe(':: only steps');
		expect(instances.summaryOf('')).toBe('Done');
	});
});
