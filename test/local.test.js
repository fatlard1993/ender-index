import { describe, expect, test } from 'bun:test';

import { SPEC, allowed, handle } from '../scripts/local';

const request = (path, { method = 'GET', host = 'localhost:7460', origin } = {}) =>
	new Request(`http://${host}${path}`, {
		method,
		headers: { host, ...(origin ? { origin } : {}) },
		...(method === 'POST' ? { body: '{}' } : {}),
	});

describe('the local server', () => {
	test('answers a page served from this machine', () => {
		expect(allowed(request('/api/instances'), 7460)).toBe(true);
		expect(allowed(request('/api/instances/a/add', { method: 'POST', origin: 'http://localhost:7460' }), 7460)).toBe(
			true,
		);
	});

	test("refuses another site's page asking it to change an instance", () => {
		expect(allowed(request('/api/instances/a/add', { method: 'POST', origin: 'https://evil.example' }), 7460)).toBe(
			false,
		);
		expect(allowed(request('/api/instances/a/add', { method: 'POST' }), 7460)).toBe(false);
	});

	test('refuses a name rebound to this address', () => {
		expect(allowed(request('/api/instances', { host: 'evil.example:7460' }), 7460)).toBe(false);
	});

	test('adds only what search writes, never a path or a url', () => {
		expect(SPEC.test('gh:owner/repo')).toBe(true);
		expect(SPEC.test('gl:group/sub/project')).toBe(true);
		expect(SPEC.test('mr:sodium')).toBe(true);
		expect(SPEC.test('./evil.jar')).toBe(false);
		expect(SPEC.test('https://evil.example/x.jar')).toBe(false);
		expect(SPEC.test('gh:owner/repo --instance other')).toBe(false);
		expect(SPEC.test('gh:../../etc')).toBe(false);
	});

	test('names an instance only by a plain name, never a path', async () => {
		expect((await handle(request('/api/instances/.hidden'))).status).toBe(400);
		expect((await handle(request('/api/instances/%2e%2e'))).status).toBe(404);
	});

	test('serves nothing outside the build', async () => {
		expect((await handle(request('/../../package.json'))).status).toBe(404);
		expect((await handle(request('/%2e%2e/%2e%2e/package.json'))).status).toBe(404);
	});
});
