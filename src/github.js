import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { appTokens } from './appToken';
import { fetchSteady, RateLimited } from './fetch';
import { fromGraphql, repositoriesQuery } from './graphqlRepos';
import { notesOf } from './record';

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

let appToken;

/**
 * A GitHub App's installation on the index's owner first, when CRAWL_APP_ID and CRAWL_APP_KEY name one, so the crawl spends
 * the App's rate limit and no person's; else GITHUB_TOKEN, or on a workstation the `gh` CLI's. Code search refuses
 * to run without one.
 */
const token = async () => {
	if (process.env.CRAWL_APP_ID && process.env.CRAWL_APP_KEY) {
		appToken ??= appTokens({
			appId: process.env.CRAWL_APP_ID,
			key: process.env.CRAWL_APP_KEY,
			account: 'fatlard1993',
		});

		return appToken();
	}

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

/** Drop the cache read so far, so the next ask reads the file again. */
export const forgetCache = () => {
	responses = undefined;
	loading = undefined;
};

export const saveCache = async () => {
	if (responses === undefined) return;

	await mkdir(dirname(CACHE), { recursive: true });
	await Bun.write(CACHE, JSON.stringify(responses));
};

/** When a cached response for this path was last fetched or confirmed, or 0 for never. */
export const lastFetched = async path => (await cache())[path]?.fetched ?? 0;

/** The tags of a repository's releases as the crawl last read them, newest first, or undefined when it never has. */
export const cachedReleaseTags = async fullName =>
	(await cache())[releasesPath(fullName)]?.body?.map(release => release.tag_name);

/** What a path costs is filed under: deep history pages are read once, the rest on every crawl. */
export const kindOf = path => {
	if (path.startsWith('/search/code')) return 'code search';
	if (path.startsWith('/search/')) return 'repository search';
	if (path.includes('/git/trees/')) return 'trees';
	if (/\/releases\?.*&page=/.test(path)) return 'history pages';
	if (path.includes('/releases')) return 'releases';
	if (path.endsWith('/readme')) return 'readmes';
	if (path.includes('/contributors')) return 'contributors';
	if (path.startsWith('/gists/')) return 'gists';

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
 * conditionally, and an unchanged answer comes from the cache; one `stale` finds trimmed of a field kept since is asked
 * for in full.
 */
/**
 * Requests left untouched for whoever the token belongs to: a personal token's hourly allowance is all of its owner's
 * tools', not the crawl's alone. CRAWL_RESERVE sets it; none by default, as the Actions token is the repository's own.
 */
const reserve = () => Number(process.env.CRAWL_RESERVE ?? 0);

export const request = async (path, keep, stale = () => false) => {
	const { remaining, resetAt } = spending;

	if (remaining !== undefined && remaining <= reserve() && Date.now() < resetAt && !path.startsWith('/search/')) {
		throw new RateLimited(
			`GitHub's rate limit is down to the ${reserve()} kept for its token's owner until ${new Date(resetAt).toISOString()}`,
			resetAt,
		);
	}

	const known = keep && (await cache())[path];
	const cached = known && !stale(known.body) ? known : undefined;
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

			throw new RateLimited(`GitHub's rate limit resets at ${new Date(resetAt).toISOString()}`, resetAt);
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
	parent: repo.parent && { full_name: repo.parent.full_name },
	fork: repo.fork,
});

const releaseFields = list =>
	list.map(release => ({
		tag_name: release.tag_name,
		published_at: release.published_at,
		prerelease: release.prerelease,
		draft: release.draft,
		body: notesOf(release.body),
		assets: (release.assets ?? []).map(({ id, name, size, browser_download_url, download_count }) => ({
			id,
			name,
			size,
			browser_download_url,
			download_count,
		})),
	}));

export const repositoryPath = fullName => `/repos/${fullName}`;

const releasesPath = fullName => `/repos/${fullName}/releases?per_page=30`;

/**
 * Repositories asked about in one GraphQL query, with thirty releases and their assets each. GitHub refuses a query
 * whose download counts take too long to gather, as ten of the most downloaded mods' do, and such a batch is asked
 * again in halves.
 */
export const REPOSITORY_BATCH = 10;

/** Batches asked for ahead of the one the crawl is reading, so the next is there when it gets to it. */
const AHEAD = 3;

let planned = { batches: [], batchOf: new Map(), loads: [], ask: undefined, keep: undefined };

const batched = { asked: 0, failed: 0 };

/** How many GraphQL batches the crawl asked for, and how many of those fell back to REST. */
export const batchesAsked = () => ({ ...batched });

/**
 * Read these repositories' details and first page of releases over GraphQL, REPOSITORY_BATCH to a query, as the
 * crawl comes to them in this order: GraphQL's limit is counted apart from REST's, and one query answers for many
 * repositories. Each answer is kept as the REST requests would keep it, so the crawl's order by when each was read
 * holds, and a batch GitHub will not answer leaves its repositories to REST.
 */
/** A repository's answers kept as its REST requests would keep them, as read now. */
const keepAnswers = async (name, repo, listed) => {
	const kept = await cache();
	const now = Date.now();

	kept[repositoryPath(name)] = { ...kept[repositoryPath(name)], fetched: now, body: repo };
	kept[releasesPath(name)] = { ...kept[releasesPath(name)], fetched: now, body: listed };
};

export const planRepositories = (names, { ask = graphql, keep = keepAnswers } = {}) => {
	const batches = [];

	for (let at = 0; at < names.length; at += REPOSITORY_BATCH) batches.push(names.slice(at, at + REPOSITORY_BATCH));

	planned = {
		batches,
		batchOf: new Map(batches.flatMap((batch, at) => batch.map(name => [name.toLowerCase(), at]))),
		loads: [],
		ask,
		keep,
	};
};

const TOO_HEAVY = /Resource limits for this query exceeded/;

/** One batch's answer, each repository by its place in it, asked again in halves for as long as GitHub finds it too heavy. */
const askInHalves = async names => {
	try {
		return await planned.ask(repositoriesQuery(names, 30));
	} catch (error) {
		if (!TOO_HEAVY.test(error.message) || names.length === 1) throw error;

		const half = Math.ceil(names.length / 2);
		const [first, second] = await Promise.all([askInHalves(names.slice(0, half)), askInHalves(names.slice(half))]);

		return {
			...first,
			...Object.fromEntries(Object.entries(second).map(([alias, node]) => [`r${Number(alias.slice(1)) + half}`, node])),
		};
	}
};

const loadBatch = async at => {
	const names = planned.batches[at];

	++batched.asked;

	try {
		const data = await askInHalves(names);
		const found = new Map();

		for (const [index, name] of names.entries()) {
			const node = data[`r${index}`];

			if (!node) continue;

			const { repo, releases: listed } = fromGraphql(node, notesOf);

			found.set(name.toLowerCase(), { repo, releases: listed });
			await planned.keep(name, repo, listed);
		}

		return found;
	} catch (error) {
		++batched.failed;
		console.error(`GraphQL batch of ${names[0]} and ${names.length - 1} more :: ${error.message}; read over REST`);

		return new Map();
	}
};

/** What a planned batch read of a repository, or undefined when it is not planned, GraphQL failed, or found none. */
const prefetched = async fullName => {
	const at = planned.batchOf.get(fullName.toLowerCase());

	if (at === undefined) return undefined;

	for (let next = at; next <= at + AHEAD && next < planned.batches.length; ++next)
		planned.loads[next] ??= loadBatch(next);

	return (await planned.loads[at]).get(fullName.toLowerCase());
};

export const repository = async fullName =>
	(await prefetched(fullName))?.repo ?? request(repositoryPath(fullName), repositoryFields, kept => !('fork' in kept));

/** The first page is kept and asked about conditionally each crawl; a deeper page is read once, so it is not kept. */
export const releases = async (fullName, page = 1) => {
	if (page !== 1) return releaseFields(await request(`/repos/${fullName}/releases?per_page=30&page=${page}`));

	return (await prefetched(fullName))?.releases ?? request(releasesPath(fullName), releaseFields);
};

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

export const searchRepositories = (query, page = 1) =>
	request(`/search/repositories?${new URLSearchParams({ q: query, per_page: '100', page: String(page) })}`);

/** A gist, with each of its files' contents: a file over a megabyte comes truncated, with a raw_url to the whole of it. */
export const gist = id => request(`/gists/${id}`);

/** Every file path in a repository at its default branch, in one request. */
export const filesOf = async fullName =>
	((await request(`/repos/${fullName}/git/trees/HEAD?recursive=1`)).tree ?? [])
		.filter(item => item.type === 'blob')
		.map(item => item.path);

/**
 * The funding links GitHub reads from each of an account's own repositories that is not a fork, in no order: a fork
 * keeps the FUNDING.yml of the project it was forked from.
 */
export const ownerRepositoryFunding = async login => {
	const data = await graphql(
		`query { repositoryOwner(login: ${JSON.stringify(login)}) { repositories(first: 100, isFork: false, ownerAffiliations: OWNER, orderBy: { field: STARGAZERS, direction: DESC }) { nodes { fundingLinks { platform url } } } } }`,
	);

	return (data.repositoryOwner?.repositories.nodes ?? []).flatMap(node => node.fundingLinks);
};

/** A repository's contributors, the most commits first, as `keep` trims them: it is kept and asked about conditionally. */
export const contributors = (fullName, keep) => request(`/repos/${fullName}/contributors?per_page=100`, keep);

/**
 * POST a GraphQL query, whose rate limit is counted apart from the REST one the crawl spends. A repository that is not
 * there answers null beside a NOT_FOUND error, which is an answer; any other error is not.
 */
export const graphql = async query => {
	const response = await fetchSteady(`${API}/graphql`, {
		method: 'POST',
		headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	});

	if (response.status === 403 || response.status === 429) {
		const retryAfter = response.headers.get('retry-after');
		const reset = response.headers.get('x-ratelimit-reset');
		const resetAt = reset ? Number(reset) * 1000 : Date.now() + Number(retryAfter ?? 60) * 1000;

		throw new RateLimited(`GitHub's GraphQL rate limit resets at ${new Date(resetAt).toISOString()}`, resetAt);
	}

	if (!response.ok) throw new Error(`GitHub GraphQL answered ${response.status}`);

	const { data, errors = [] } = await response.json();
	const limited = errors.find(error => error.type === 'RATE_LIMITED');

	if (limited) {
		const resetAt = Date.parse(data?.rateLimit?.resetAt) || Date.now() + 60 * 60 * 1000;

		throw new RateLimited(`GitHub's GraphQL rate limit resets at ${new Date(resetAt).toISOString()}`, resetAt);
	}

	const failed = errors.find(error => error.type !== 'NOT_FOUND');

	if (failed || !data) throw new Error(`GitHub GraphQL: ${failed?.message ?? 'no data'}`);

	return data;
};
