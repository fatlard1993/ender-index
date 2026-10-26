/** A file in a repository, by its host's file URLs rather than its API, which a rate limit counts. */
const RAW = {
	github: (name, path) => `https://raw.githubusercontent.com/${name}/HEAD/${path}`,
	codeberg: (name, path) => `https://codeberg.org/api/v1/repos/${name}/raw/${path}`,
	gitlab: (name, path) =>
		`https://gitlab.com/api/v4/projects/${encodeURIComponent(name)}/repository/files/${encodeURIComponent(path)}/raw?ref=HEAD`,
};

export const rawUrl = (host, name, path) => RAW[host](name, path);
