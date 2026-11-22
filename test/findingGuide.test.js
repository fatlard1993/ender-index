import { expect, test } from 'bun:test';

import { CAPABILITIES, FINDING_GUIDE, LEVELS, WARNINGS, byLevel, guideOf } from '../client/search';

test('every finding the scan can make has a level, a few words and a meaning for players', () => {
	// Plain checks: Bun's toMatchObject writes its asymmetric matchers into the object it checks, here the shared guide
	for (const name of [...Object.keys(CAPABILITIES), ...Object.keys(WARNINGS), 'hosts', 'unreadable']) {
		expect(Object.keys(LEVELS)).toContain(FINDING_GUIDE[name]?.level);
		expect(FINDING_GUIDE[name].label.length).toBeGreaterThan(0);
		expect(FINDING_GUIDE[name].meaning.length).toBeGreaterThan(0);
	}
});

test('a finding the guide does not know yet is kept, under its own name, as worth a look', () => {
	expect(guideOf('beacon')).toEqual({ level: 'notable', label: 'beacon', meaning: '' });
	expect(byLevel(['network', 'beacon', 'exec'])).toEqual(['exec', 'beacon', 'network']);
});
