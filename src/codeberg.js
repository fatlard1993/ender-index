/** Codeberg runs Forgejo, whose API answers in nearly GitHub's shapes. */
const API = 'https://codeberg.org/api/v1';

const get = async path => {
	const response = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } });

	if (!response.ok)
		throw Object.assign(new Error(`Codeberg ${response.status} for ${path}`), { status: response.status });

	return response.json();
};

export const repository = async fullName => {
	const repo = await get(`/repos/${fullName}`);

	return {
		full_name: repo.full_name,
		description: repo.description || undefined,
		stargazers_count: repo.stars_count,
		archived: repo.archived,
		created_at: repo.created_at,
		pushed_at: repo.updated_at,
	};
};

/** A repository with releases switched off answers 404 for them, which is a repository with no releases. */
const releaseList = async fullName => {
	try {
		return await get(`/repos/${fullName}/releases?limit=30`);
	} catch (error) {
		if (error.status === 404) return [];

		throw error;
	}
};

export const releases = async fullName =>
	(await releaseList(fullName)).map(release => ({
		tag_name: release.tag_name,
		published_at: release.published_at,
		prerelease: release.prerelease,
		draft: release.draft,
		assets: (release.assets ?? []).map(({ id, name, size, browser_download_url }) => ({
			id,
			name,
			size,
			browser_download_url,
		})),
	}));

/** Repositories carrying a topic, for discovery. */
export const withTopic = async topic => {
	const { data = [] } = await get(`/repos/search?${new URLSearchParams({ q: topic, topic: 'true', limit: '50' })}`);

	return data.map(repo => repo.full_name);
};
