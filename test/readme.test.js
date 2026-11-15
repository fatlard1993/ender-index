import { afterAll, beforeAll, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

import { browser } from './dom';

let restore;
let renderReadme;

beforeAll(async () => {
	restore = browser();
	({ renderReadme } = await import('../client/ModPage'));
});

afterAll(() => restore());

const sources = { raw: path => `https://raw.example/${path}`, page: path => `https://example/${path}` };

// Sanitized by jsdom's HTML parser, which parses as a browser does. happy-dom's lets a <button> in a paragraph through
// DOMPurify from 3.4.8 whatever the config, where Chrome's doesn't, so under it this test would check nothing.
const { window: parser } = new JSDOM('');

test('a readme carries no form to post to ender web, which trusts this page', () => {
	for (const tag of [
		'<form action="/api/instances" method="post" enctype="text/plain">Download</form>',
		'<input name=\'{"name":"x"}\' value="y">',
		'<button>Download</button>',
		'<textarea name="x">y</textarea>',
	]) {
		expect(renderReadme(tag, sources, parser)).not.toMatch(/<(form|input|button|textarea)/);
	}

	expect(renderReadme('[a link](docs.md)', sources, parser)).toContain('href="https://example/docs.md"');
});
