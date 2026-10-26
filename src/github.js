import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { fetchSteady, RateLimited } from './fetch';

const API = 'https://api.github.com';

/**
 * Responses kept between crawls, so an unchanged one is answered 304, which GitHub does not count against
 * the rate limit. GitHub's ETag varies with the token, and Actions issues a new one each run, so this
 * pays only with a token that outlasts the run: CRAWL_TOKEN.
 */
export const CACHE = join(import.meta.dir, '..', '.cache', 'responses.json');

let cachedToken;
let responses;
let loading;

/** Actions provides GITHUB_TOKEN; on a workstation the `gh` CLI has one. Code search refuses to run without either. */
const token = async () => {
	if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
	if (cachedToken !== undefined) return cachedToken;

	try {
		const process_ = Bun.spawn(['gh', 'auth', 'token'], { stdout: 'pipe', stderr: 'ignore' });
		const output = (await new Response(process_.stdout).text()).trim();

		cachedToken = (await process_.exited) === 0 ? output : '';
	} catch {
		cachedToken = '';
	}

	if (cachedToken === '') throw new Error('No GitHub token: set GITHUB_TOKEN or sign in with `gh auth login`');

	return cachedToken;
};

/** Loaded once however many callers ask at the same moment; each parse of a large cache costs its size again. */
const cache = () => {
	loading ??= (async () => {
		const file = Bun.file(CACHE);

		responses = (await file.exists()) ? await file.json() : {};

		return responses;
	})();

	return loading;
};

export const saveCache = async () => {
	if (responses === undefined) return;

	await mkdir(dirname(CACHE), { recursive: true });
	await Bun.write(CACHE, JSON.stringify(responses));
};

/** When a cached response for this path was last fetched or confirmed, or 0 for never. */
export const lastFetched = async path => (await cache())[path]?.fetched ?? 0;

/** What a path costs is filed under: deep history pages are read once, the rest on every crawl. */
export const kindOf = path => {
	if (path.startsWith('/search/')) return 'code search';
	if (/\/releases\?.*&page=/.test(path)) return 'history pages';
	if (path.includes('/releases')) return 'releases';
	if (path.endsWith('/readme')) return 'readmes';

	return 'repository';
};

const spending = { full: {}, unchanged: 0 };

/**
 * Requests answered in full, by kind, which are what the rate limit counts, and those answered 304,
 * which it does not; with the limit as the last answer left it.
 */
export const spent = () => structuredClone(spending);

const note = (path, response) => {
	const remaining = response.headers.get('x-ratelimit-remaining');

	if (response.status === 304) ++spending.unchanged;
	else if (remaining !== '0') spending.full[kindOf(path)] = (spending.full[kindOf(path)] ?? 0) + 1;

	// Code search has a limit of its own, reported in the same headers.
	if (remaining !== null && response.headers.get('x-ratelimit-resource') === 'core') {
		spending.remaining = Number(remaining);
		spending.resetAt = Number(response.headers.get('x-ratelimit-reset')) * 1000;
	}
};

/**
 * GET an API path. With `keep`, the response is cached as `keep` trims it and asked for again
 * conditionally, and an unchanged answer comes from the cache.
 */
export const request = async (path, keep) => {
	const cached = keep && (await cache())[path];
	const response = await fetchSteady(`${API}${path}`, {
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${await token()}`,
			...(cached ? { 'if-none-match': cached.etag } : {}),
		},
	});

	note(path, response);

	if (response.status === 304 && cached) {
		cached.fetched = Date.now();

		return cached.body;
	}

	if (!response.ok) {
		const limited = response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after');

		if (limited && (response.status === 403 || response.status === 429)) {
			const reset = response.headers.get('x-ratelimit-reset');
			const retryAfter = response.headers.get('retry-after');
			const resetAt = reset ? Number(reset) * 1000 : Date.now() + Number(retryAfter ?? 60) * 1000;

			throw new RateLimited(`the rate limit resets at ${new Date(resetAt).toISOString()}`, resetAt);
		}

		throw Object.assign(new Error(`GitHub ${response.status} for ${path}`), { status: response.status });
	}

	const body = await response.json();

	if (!keep) return body;

	const kept = keep(body);
	const etag = response.headers.get('etag');

	if (etag) (await cache())[path] = { etag, fetched: Date.now(), body: kept };

	return kept;
};

const repositoryFields = repo => ({
	full_name: repo.full_name,
	description: repo.description,
	stargazers_count: repo.stargazers_count,
	archived: repo.archived,
	license: repo.license && { spdx_id: repo.license.spdx_id },
	created_at: repo.created_at,
	pushed_at: repo.pushed_at,
});

const releaseFields = list =>
	list.map(release => ({
		tag_name: release.tag_name,
		published_at: release.published_at,
		prerelease: release.prerelease,
		draft: release.draft,
		assets: (release.assets ?? []).map(({ id, name, size, browser_download_url, download_count }) => ({
			id,
			name,
			size,
			browser_download_url,
			download_count,
		})),
	}));

export const repositoryPath = fullName => `/repos/${fullName}`;

export const repository = fullName => request(repositoryPath(fullName), repositoryFields);

/** The first page is kept and asked about conditionally each crawl; a deeper page is read once, so it is not kept. */
export const releases = async (fullName, page = 1) =>
	page === 1
		? request(`/repos/${fullName}/releases?per_page=30`, releaseFields)
		: releaseFields(await request(`/repos/${fullName}/releases?per_page=30&page=${page}`));

/** The path of the readme GitHub shows for a repository, or null when it has none. */
export const readme = async fullName => {
	try {
		return (await request(`/repos/${fullName}/readme`)).path;
	} catch (error) {
		if (error.status === 404) return null;

		throw error;
	}
};

export const searchCode = (query, page = 1) =>
	request(`/search/code?${new URLSearchParams({ q: query, per_page: '100', page: String(page) })}`);
