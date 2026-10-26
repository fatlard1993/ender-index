import { describe, expect, test } from 'bun:test';

import { fundingOf } from '../src/crawl';

const serving = files => {
	const original = globalThis.fetch;
	const asked = [];

	globalThis.fetch = async url => {
		asked.push(String(url));

		const found = Object.entries(files).find(([ending]) => String(url).endsWith(ending));

		if (found?.[1] === 403) return new Response('', { status: 403 });

		return found ? new Response(found[1]) : new Response('', { status: 404 });
	};

	return { asked, restore: () => (globalThis.fetch = original) };
};

const now = '2026-10-26T00:00:00.000Z';

describe("an author's funding", () => {
	test("is the repository's FUNDING.yml, or on GitHub its owner's, read once for all their repositories", async () => {
		const { asked, restore } = serving({ 'maker/.github/HEAD/FUNDING.yml': 'ko_fi: maker' });
		const owners = new Map();

		try {
			const first = await fundingOf({ host: 'github', name: 'maker/one', now, owners });
			const second = await fundingOf({ host: 'github', name: 'maker/two', now, owners });

			expect(first).toEqual({ funding: [{ platform: 'ko_fi', url: 'https://ko-fi.com/maker' }], fundingChecked: now });
			expect(second.funding).toEqual(first.funding);
			expect(asked.filter(url => url.includes('maker/.github/HEAD/FUNDING.yml'))).toHaveLength(1);
		} finally {
			restore();
		}
	});

	test('is read again only after a week, and kept as it was when the host fails', async () => {
		const recorded = { funding: [{ platform: 'patreon', url: 'https://www.patreon.com/a' }], fundingChecked: now };
		const { asked, restore } = serving({ '.github/FUNDING.yml': 403 });

		try {
			expect(await fundingOf({ host: 'github', name: 'a/b', recorded, now, owners: new Map() })).toEqual(recorded);
			expect(asked).toEqual([]);

			const later = '2026-11-05T00:00:00.000Z';

			expect(await fundingOf({ host: 'github', name: 'a/b', recorded, now: later, owners: new Map() })).toEqual(
				recorded,
			);
		} finally {
			restore();
		}
	});
});
