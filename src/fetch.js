/** Pauses before each retry. A server error or a dropped connection says nothing about what was asked for. */
const PAUSES = [2000, 8000];

/** fetch, asked again after a server error or a network failure; any other answer is returned as it came. */
export const fetchSteady = async (url, init, { pauses = PAUSES } = {}) => {
	for (let attempt = 0; ; ++attempt) {
		let failure;

		try {
			const response = await fetch(url, init);

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
