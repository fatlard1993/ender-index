import { describe, expect, test } from 'bun:test';

import { EXPLANATION_KEPT, explain, findingOf, speaksFor } from '../src/explain';

const record = {
	repo: 'Author/boats',
	releases: [
		{ tag: '1.1', assets: [{ scan: { capabilities: { network: {} }, hosts: { 'api.modrinth.com': [] } } }] },
		{ tag: '1.0', assets: [{ scan: { capabilities: {} } }] },
	],
	contributors: {
		commits: 10,
		people: [
			{ login: 'Author', commits: 4 },
			{ login: 'Partner', commits: 5 },
			{ login: 'Passerby', commits: 1 },
		],
	},
};

const issue = ({
	mod = 'https://github.com/Author/boats',
	finding = 'network: its code can open network connections',
	text = 'It checks Modrinth for a newer version, once a day.',
	by = 'Author',
	labels = [],
} = {}) => ({
	body: `### Mod\n\n${mod}\n\n### Finding\n\n${finding}\n\n### Explanation\n\n${text || '_No response_'}`,
	user: { login: by },
	labels: labels.map(name => ({ name })),
	html_url: 'https://github.com/fatlard1993/ender-index/issues/9',
});

const run = (filed, explanations = {}, now = '2026-11-21T00:00:00Z') =>
	explain(filed, {
		explanations,
		now,
		readRecord: async name => (name.toLowerCase() === 'author/boats' ? record : undefined),
	});

describe('an author explaining a finding', () => {
	test('speaks for the repository as its owner, or as a contributor who made at least half its commits', () => {
		expect(speaksFor('author', record)).toBe(true);
		expect(speaksFor('Partner', record)).toBe(true);
		expect(speaksFor('Passerby', record)).toBe(false);
		expect(speaksFor('Stranger', record)).toBe(false);
		expect(speaksFor(undefined, record)).toBe(false);
	});

	test('names the finding by the word its option starts with', () => {
		expect(findingOf('network: its code can open network connections')).toBe('network');
		expect(findingOf('hosts: the hosts its strings name')).toBe('hosts');
		expect(findingOf('_No response_')).toBeUndefined();
	});

	test('is shown, with who wrote it and the release it was written for', async () => {
		const { explanations, shown, say } = await run(issue());

		expect(shown).toBe(true);
		expect(explanations).toEqual({
			'github:Author/boats': {
				network: {
					text: 'It checks Modrinth for a newer version, once a day.',
					by: 'Author',
					at: '2026-11-21T00:00:00Z',
					release: '1.1',
					issue: 'https://github.com/fatlard1993/ender-index/issues/9',
				},
			},
		});
		expect(say).toContain('as your words');
		expect(say).not.toContain('shows once one does');
	});

	test('keeps when and for which release it was written while its words stay the same', async () => {
		const first = await run(issue());
		const again = await run(issue(), first.explanations, '2026-12-01T00:00:00Z');
		const edited = await run(issue({ text: 'Only when asked.' }), first.explanations, '2026-12-01T00:00:00Z');

		expect(again.explanations['github:Author/boats'].network.at).toBe('2026-11-21T00:00:00Z');
		expect(edited.explanations['github:Author/boats'].network).toMatchObject({
			text: 'Only when asked.',
			at: '2026-12-01T00:00:00Z',
		});
	});

	test('is refused from anyone who does not speak for the repository', async () => {
		const { explanations, shown, say } = await run(issue({ by: 'Passerby' }));

		expect(shown).toBe(false);
		expect(explanations).toEqual({});
		expect(say).toStartWith("Only Author/boats's author can explain its findings");
	});

	test('is taken down when its author empties it, or the index labels it withdrawn', async () => {
		const { explanations } = await run(issue());
		const emptied = await run(issue({ text: '' }), explanations);
		const withdrawn = await run(issue({ by: 'Stranger', labels: ['explain', 'withdrawn'] }), explanations);

		expect(emptied).toMatchObject({ explanations: {}, shown: false });
		expect(withdrawn).toMatchObject({ explanations: {}, shown: false });
		expect(withdrawn.say).toStartWith('Taken down');
	});

	test('says what is wrong with an issue it cannot show, and changes nothing', async () => {
		const cases = [
			[issue({ mod: 'not a repository' }), 'The form names no repository'],
			[issue({ mod: 'https://codeberg.org/Author/boats' }), 'Only a mod on GitHub'],
			[issue({ mod: 'Someone/else' }), 'Someone/else is not in the index'],
			[issue({ finding: '_No response_' }), 'Choose which finding'],
			[issue({ text: 'x'.repeat(EXPLANATION_KEPT + 1) }), 'past the 1000 shown'],
		];

		for (const [filed, said] of cases) {
			const { explanations, shown, say } = await run(filed);

			expect(shown).toBe(false);
			expect(explanations).toEqual({});
			expect(say).toContain(said);
		}
	});

	test('of a finding none of its jars has yet is kept, and says it shows once one does', async () => {
		const { shown, say } = await run(issue({ finding: 'exec: its code can start other programs' }));

		expect(shown).toBe(true);
		expect(say).toContain('shows once one does');
	});
});
