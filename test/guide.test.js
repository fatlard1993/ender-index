import { expect, test } from 'bun:test';

import guide from '../client/authors.md' with { type: 'text' };
import { findingsMarkup, renderGuide } from '../client/guide';

const ids = markup => [...markup.matchAll(/<h[2-6] id="([^"]+)"/g)].map(([, id]) => id);

test("the guide's parts are linked by name, so a link to one keeps landing there", () => {
	expect(ids(renderGuide(guide))).toEqual(
		expect.arrayContaining(['releases', 'funding', 'being-found', 'explaining-a-finding', 'opting-out', 'notices']),
	);
});

test("the guide's links leave the index in a new tab, and a link to one of its parts stays on the page", () => {
	expect(renderGuide('[an issue](https://example.com)')).toContain('target="_blank"');
	expect(renderGuide('[a part](#funding)')).toBe('<p><a href="#funding">a part</a></p>\n');
});

test("the findings page has a part for each finding, by the word the mod page's link names it with", () => {
	expect(ids(findingsMarkup())).toEqual(
		expect.arrayContaining([
			'network',
			'exec',
			'native',
			'unsafe',
			'classloading',
			'hosts',
			'webhook',
			'session',
			'persistence',
			'clipboard',
			'hidden',
			'initializer',
			'zip',
			'unsourced',
			'secrets',
			'unreadable',
			'scanner-versions',
			'for-authors',
		]),
	);
});
