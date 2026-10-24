const API = 'https://api.github.com';

let cachedToken;

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

export const request = async path => {
	const response = await fetch(`${API}${path}`, {
		headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${await token()}` },
	});

	if (!response.ok) {
		const reset = response.headers.get('x-ratelimit-reset');
		const limited = response.headers.get('x-ratelimit-remaining') === '0';
		const when = limited && reset ? `; the limit resets at ${new Date(Number(reset) * 1000).toISOString()}` : '';

		throw new Error(`GitHub ${response.status} for ${path}${when}`);
	}

	return response.json();
};

export const repository = fullName => request(`/repos/${fullName}`);

export const releases = fullName => request(`/repos/${fullName}/releases?per_page=30`);

export const searchCode = (query, page = 1) =>
	request(`/search/code?${new URLSearchParams({ q: query, per_page: '100', page: String(page) })}`);
