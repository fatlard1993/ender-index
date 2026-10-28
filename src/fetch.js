/** Pauses before each retry. A server error or a dropped connection says nothing about what was asked for. */
const PAUSES = [2000, 8000];

/** The longest a host asking to be left alone is waited for; GitHub's hourly reset is the crawl's to handle. */
const WAIT_AT_MOST = 2 * 60 * 1000;

const SLOW_DOWNS = 5;

/**
 * How long one request may take, its body included, before it counts as failed and is asked again. A connection that
 * stalls answers nothing and errors nothing: without a limit a single one held a crawl until its runner was stopped.
 */
export const REQUEST_LIMIT = 3 * 60 * 1000;

/** How long a 429 asks to be left alone: Retry-After in seconds, or GitLab's RateLimit-Reset as a time. */
export const askedToWait = response => {
	const after = Number(response.headers.get('retry-after') ?? Number.NaN);

	if (!Number.isNaN(after)) return after * 1000;

	const reset = Number(response.headers.get('ratelimit-reset') ?? Number.NaN);

	return Number.isNaN(reset) ? undefined : Math.max(0, reset * 1000 - Date.now());
};

/**
 * How long a 429 that says nothing is waited out: a minute, the window GitLab counts its anonymous requests over. Its
 * limit is per address, and a CI runner shares its address with whoever else it serves.
 */
const UNSAID_WAIT = 60 * 1000;

/** A host's rate limit, which lifts at resetAt; the crawl waits for that when its time budget allows. */
export class RateLimited extends Error {
	constructor(message, resetAt) {
		super(message);

		this.resetAt = resetAt;
	}
}

/** The RateLimited a 429 that asked for longer than fetchSteady waits stands for. */
export const limitedBy = (host, response) => {
	const resetAt = Date.now() + (askedToWait(response) ?? UNSAID_WAIT);

	return new RateLimited(`${host} asks to be left alone until ${new Date(resetAt).toISOString()}`, resetAt);
};

/**
 * fetch, asked again after a server error or a network failure, and after a 429 that says how long to wait when that
 * is not long; any other answer is returned as it came.
 */
export const fetchSteady = async (url, init, { pauses = PAUSES, unsaid = UNSAID_WAIT, limit = REQUEST_LIMIT } = {}) => {
	for (let attempt = 0, slowed = 0; ; ++attempt) {
		let failure;

		try {
			const timeout = AbortSignal.timeout(limit);
			const response = await fetch(url, {
				...init,
				signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
			});
			const wait = response.status === 429 && slowed < SLOW_DOWNS ? (askedToWait(response) ?? unsaid) : undefined;

			if (wait !== undefined && wait <= WAIT_AT_MOST) {
				await response.body?.cancel();
				console.error(
					`waiting ${Math.ceil(wait / 1000)}s: ${new URL(url).host} answered 429${askedToWait(response) === undefined ? ', saying for how long nowhere' : ''}`,
				);
				await Bun.sleep(wait);
				++slowed;
				--attempt;

				continue;
			}

			if (response.status < 500 || attempt === pauses.length) return response;

			await response.body?.cancel();
			failure = `answered ${response.status}`;
		} catch (error) {
			const said = error.name === 'TimeoutError' ? new Error(`took longer than ${limit / 1000}s`) : error;

			if (attempt === pauses.length) throw said;

			failure = said.message;
		}

		console.error(`retrying in ${pauses[attempt] / 1000}s: ${new URL(url).host} ${failure}`);
		await Bun.sleep(pauses[attempt]);
	}
};
