import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, test } from 'bun:test';

import { appJwt, appTokens } from '../src/appToken';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = privateKey.export({ type: 'pkcs8', format: 'pem' });

describe("a GitHub App's tokens", () => {
	test('are asked for with a token the App signs, valid for under ten minutes and dated back a minute', () => {
		const jwt = appJwt(123, key, Date.parse('2026-10-31T00:00:00Z'));
		const [header, payload, signature] = jwt.split('.');

		expect(createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, signature, 'base64url')).toBe(
			true,
		);
		expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
			iat: Date.parse('2026-10-31T00:00:00Z') / 1000 - 60,
			exp: Date.parse('2026-10-31T00:00:00Z') / 1000 + 540,
			iss: '123',
		});
	});

	test("come from the index's installation, kept until near their expiry, then asked for again", async () => {
		let clock = Date.parse('2026-10-31T00:00:00Z');
		const asked = [];
		const fetcher = async (url, { method }) => {
			asked.push(`${method} ${url.replace('https://api.github.com', '')}`);

			if (url.endsWith('/installation')) return Response.json({ id: 9 });

			return Response.json({ token: `t${asked.length}`, expires_at: new Date(clock + 60 * 60 * 1000).toISOString() });
		};
		const next = appTokens({ appId: 1, key, repository: 'o/index', fetcher, now: () => clock });

		expect(await next()).toBe('t2');
		clock += 50 * 60 * 1000;
		expect(await next()).toBe('t2');
		clock += 6 * 60 * 1000;
		expect(await next()).toBe('t3');
		expect(asked).toEqual([
			'GET /repos/o/index/installation',
			'POST /app/installations/9/access_tokens',
			'POST /app/installations/9/access_tokens',
		]);
	});

	test('that cannot be had say which App, which repository, and what to check', async () => {
		const next = appTokens({
			appId: 7,
			key,
			repository: 'o/index',
			fetcher: async () => new Response('', { status: 404 }),
		});

		await expect(next()).rejects.toThrow(
			'GitHub App 7 could not get a token for o/index: /repos/o/index/installation answered 404; is it installed there?',
		);
	});
});
