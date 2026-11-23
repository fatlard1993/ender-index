import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { fromProviders, providerOf } from 'ender-launcher/rank';

import { buildProviders, providersText } from '../src/providers';

const root = join(import.meta.dir, '..');

test("places every mod id the listing claims exactly as ender's providerOf does from the whole listing", async () => {
	const entries = await Bun.file(join(root, 'data', 'search.json')).json();
	const providers = JSON.parse(providersText(buildProviders(entries)));
	const ids = Object.keys(providers.ids);
	const disagreements = [];
	const key = entry => entry && `${entry.host ?? 'github'}:${entry.repo}`;

	for (const fits of [
		{},
		{ minecraft: '26.3', loader: 'fabric' },
		{ minecraft: '1.20.1', loader: 'forge' },
		{ minecraft: '1.21.1', loader: 'neoforge' },
	]) {
		for (const id of ids) {
			const requiring = { host: 'github', repo: `${id}-owner/requiring` };
			const fromListing = key(providerOf(id, entries, requiring, fits));
			const fromFile = key(fromProviders(id, providers, requiring, fits).provider);

			if (fromListing !== fromFile) disagreements.push(`${id} ${JSON.stringify(fits)}: ${fromListing} vs ${fromFile}`);
		}
	}

	expect(ids.length).toBeGreaterThan(1000);
	expect(disagreements.slice(0, 10)).toEqual([]);
}, 300_000);

test('is written a repository or a mod id to a line, and reads back as written', () => {
	const providers = {
		repositories: [
			{ host: 'github', repo: 'a/b', established: true, targets: [{ loader: 'fabric', minecraft: '~26.3' }] },
		],
		ids: { 'a-mod': [0], other: [0] },
	};
	const text = providersText(providers);

	expect(JSON.parse(text)).toEqual(providers);
	expect(text.split('\n')).toHaveLength(7);
});
