import { basename } from 'node:path';

import { fetchSteady, limitedBy } from './fetch';

const API = 'https://gitlab.com/api/v4';

const get = async path => {
	const response = await fetchSteady(`${API}${path}`, { headers: { accept: 'application/json' } });

	if (response.status === 429) throw limitedBy('GitLab', response);
	if (!response.ok)
		throw Object.assign(new Error(`GitLab ${response.status} for ${path}`), { status: response.status });

	return response.json();
};

const project = fullName => `/projects/${encodeURIComponent(fullName)}`;

/** GitLab names a project's readme by its page, `.../-/blob/<ref>/<path>`; the path is what a page fetches. */
export const readmePath = url => (url ? decodeURIComponent(url.replace(/^.*?\/-\/blob\/[^/]+\//, '')) : null);

export const repository = async fullName => {
	const repo = await get(`${project(fullName)}?license=true`);

	return {
		full_name: repo.path_with_namespace,
		description: repo.description || undefined,
		stargazers_count: repo.star_count,
		archived: Boolean(repo.archived),
		license: repo.license && { spdx_id: repo.license.key },
		created_at: repo.created_at,
		pushed_at: repo.last_activity_at,
		readme: readmePath(repo.readme_url),
	};
};

/**
 * GitLab release assets are links, named for display rather than by file, and they may point
 * anywhere. The file name a crawl filters on is the last segment of where the link leads. A link to a
 * CI job's artifact under `artifacts/file/` leads to GitLab's page about the file; `artifacts/raw/`
 * is the file.
 */
export const assetOf = link => {
	const url = (link.direct_asset_url ?? link.url).replace(/(\/-\/jobs\/\d+\/artifacts)\/file\//, '$1/raw/');

	return { id: link.id, name: decodeURIComponent(basename(new URL(url).pathname)), browser_download_url: url };
};

/** A project with releases switched off answers 403 for them, which is a project with no releases. */
const releaseList = async (fullName, page) => {
	try {
		return await get(`${project(fullName)}/releases?per_page=30${page > 1 ? `&page=${page}` : ''}`);
	} catch (error) {
		if (error.status === 403) return [];

		throw error;
	}
};

export const releases = async (fullName, page = 1) =>
	(await releaseList(fullName, page)).map(release => ({
		tag_name: release.tag_name,
		published_at: release.released_at,
		prerelease: Boolean(release.upcoming_release),
		draft: false,
		assets: (release.assets?.links ?? []).map(assetOf),
	}));

export const withTopic = async topic =>
	(await get(`/projects?${new URLSearchParams({ topic, per_page: '100', order_by: 'star_count' })}`)).map(
		repo => repo.path_with_namespace,
	);
