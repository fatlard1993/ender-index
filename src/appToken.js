import { createSign } from 'node:crypto';

const API = 'https://api.github.com';

/** How long before a token's expiry a new one is asked for, so no request goes out on one about to lapse. */
const RENEW_BEFORE = 5 * 60 * 1000;

const base64url = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/**
 * The JSON Web Token a GitHub App signs with its private key to ask for installation tokens: GitHub accepts one for
 * at most ten minutes, and dates it a minute back for clocks that drift.
 */
export const appJwt = (appId, key, now = Date.now()) => {
	const seconds = Math.floor(now / 1000);
	const unsigned = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({ iat: seconds - 60, exp: seconds + 540, iss: String(appId) })}`;

	return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url')}`;
};

/**
 * Tokens of a GitHub App's installation on a repository, each asked for when the last is near its expiry: an
 * installation token lasts an hour, and a crawl runs for four. Its rate limit is the App's, apart from any person's.
 */
export const appTokens = ({ appId, key, repository, fetcher = fetch, now = () => Date.now() }) => {
	let installation;
	let current;

	const asked = async (path, method = 'GET') => {
		const response = await fetcher(`${API}${path}`, {
			method,
			headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${appJwt(appId, key, now())}` },
		});

		if (!response.ok) {
			throw new Error(
				`GitHub App ${appId} could not get a token for ${repository}: ${path} answered ${response.status}; is it installed there?`,
			);
		}

		return response.json();
	};

	return async () => {
		if (current && current.expires - now() > RENEW_BEFORE) return current.token;

		installation ??= (await asked(`/repos/${repository}/installation`)).id;

		const { token, expires_at: expires } = await asked(`/app/installations/${installation}/access_tokens`, 'POST');

		current = { token, expires: Date.parse(expires) };

		return token;
	};
};
