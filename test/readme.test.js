import { afterAll, beforeAll, expect, test } from 'bun:test';

import { browser } from './dom';

let restore;
let renderReadme;

beforeAll(async () => {
	restore = browser();
	({ renderReadme } = await import('../client/ModPage'));
});

afterAll(() => restore());

const sources = { raw: path => `https://raw.example/${path}`, page: path => `https://example/${path}` };

test('a readme carries no form to post to ender web, which trusts this page', () => {
	for (const tag of [
		'<form action="/api/instances" method="post" enctype="text/plain">Download</form>',
		'<input name=\'{"name":"x"}\' value="y">',
		'<button>Download</button>',
		'<textarea name="x">y</textarea>',
	]) {
		expect(renderReadme(tag, sources)).not.toMatch(/<(form|input|button|textarea)/);
	}

	expect(renderReadme('[a link](docs.md)', sources)).toContain('href="https://example/docs.md"');
});
