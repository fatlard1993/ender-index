import { expect, test } from 'bun:test';

import guide from '../client/authors.md' with { type: 'text' };
import { renderGuide } from '../client/guide';

const ids = markup => [...markup.matchAll(/<h2 id="([^"]+)"/g)].map(([, id]) => id);

test("the guide's parts are linked by name, so a link to one keeps landing there", () => {
	expect(ids(renderGuide(guide))).toEqual(expect.arrayContaining(['releases', 'funding', 'being-found', 'notices']));
});

test("the guide's links leave the index in a new tab", () => {
	expect(renderGuide('[an issue](https://example.com)')).toContain('target="_blank"');
});
