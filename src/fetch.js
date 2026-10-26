/** Pauses before each retry. A server error or a dropped connection says nothing about what was asked for. */
const PAUSES = [2000, 8000];

/** The longest a host asking to be left alone is waited for; GitHub's hourly reset is the crawl's to handle. */
const WAIT_AT_MOST = 2 * 60 * 1000;

const SLOW_DOWNS = 5;

/** How long a 429 asks to be left alone: Retry-After in seconds, or GitLab's RateLimit-Reset as a time. */
const askedToWait = response => {
	const after = Number(response.headers.get('retry-after') ?? Number.NaN);

	if (!Number.isNaN(after)) return after * 1000;

	const reset = Number(response.headers.get('ratelimit-reset') ?? Number.NaN);

	return Number.isNaN(reset) ? undefined : Math.max(0, reset * 1000 - Date.now());
};

/**
 * fetch, asked again after a server error or a network failure, and after a 429 that says how long to wait when that
 * is not long; any other answer is returned as it came.
 */
export const fetchSteady = async (url, init, { pauses = PAUSES } = {}) => {
	for (let attempt = 0, slowed = 0; ; ++attempt) {
		let failure;

		try {
			const response = await fetch(url, init);
			const wait = response.status === 429 && slowed < SLOW_DOWNS ? askedToWait(response) : undefined;

			if (wait !== undefined && wait <= WAIT_AT_MOST) {
				await response.body?.cancel();
				console.error(`waiting ${Math.ceil(wait / 1000)}s: ${new URL(url).host} answered 429`);
				await Bun.sleep(wait);
				++slowed;
				--attempt;

				continue;
			}

			if (response.status < 500 || attempt === pauses.length) return response;

			await response.body?.cancel();
			failure = `answered ${response.status}`;
		} catch (error) {
			if (attempt === pauses.length) throw error;

			failure = error.message;
		}

		console.error(`retrying in ${pauses[attempt] / 1000}s: ${new URL(url).host} ${failure}`);
		await Bun.sleep(pauses[attempt]);
	}
};
