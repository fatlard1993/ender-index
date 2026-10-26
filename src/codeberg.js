import { fetchSteady, limitedBy } from './fetch';

/** Codeberg runs Forgejo, whose API answers in nearly GitHub's shapes. */
const API = 'https://codeberg.org/api/v1';

const get = async path => {
	const response = await fetchSteady(`${API}${path}`, { headers: { accept: 'application/json' } });

	if (response.status === 429) throw limitedBy('Codeberg', response);
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
const releaseList = async (fullName, page) => {
	try {
		return await get(`/repos/${fullName}/releases?limit=30${page > 1 ? `&page=${page}` : ''}`);
	} catch (error) {
		if (error.status === 404) return [];

		throw error;
	}
};

const README = /^readme(\.(md|markdown|txt|rst|org))?$/i;

/** The readme at the root of a repository, as Forgejo shows one, or null when there is none. */
export const readme = async fullName => {
	try {
		return (
			(await get(`/repos/${fullName}/contents`)).find(file => file.type === 'file' && README.test(file.name))?.path ??
			null
		);
	} catch (error) {
		if (error.status === 404) return null;

		throw error;
	}
};

export const releases = async (fullName, page = 1) =>
	(await releaseList(fullName, page)).map(release => ({
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

/** Repositories carrying a topic, for discovery. */
export const withTopic = async topic => {
	const { data = [] } = await get(`/repos/search?${new URLSearchParams({ q: topic, topic: 'true', limit: '50' })}`);

	return data.map(repo => repo.full_name);
};
