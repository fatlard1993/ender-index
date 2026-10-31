/** A release's assets asked for: more than any mod's release attaches, under GraphQL's limit on nodes. */
export const ASSETS = 50;

/**
 * The number REST gives an asset, from the id GraphQL gives it. A current id is `RA_` and URL-safe base64 of a
 * MessagePack array whose last item is that number; a legacy one is base64 of `012:ReleaseAsset<number>`.
 */
export const assetIdOf = nodeId => {
	const legacy = Buffer.from(nodeId, 'base64')
		.toString('latin1')
		.match(/ReleaseAsset(\d+)$/);

	if (legacy) return Number(legacy[1]);

	const bytes = Buffer.from(nodeId.slice(nodeId.indexOf('_') + 1), 'base64url');
	let at = 1;
	let last;

	for (let items = bytes[0] & 0x0f; items > 0; --items) {
		const marker = bytes[at];

		if (marker < 0x80) [last, at] = [marker, at + 1];
		else if (marker === 0xcc) [last, at] = [bytes.readUInt8(at + 1), at + 2];
		else if (marker === 0xcd) [last, at] = [bytes.readUInt16BE(at + 1), at + 3];
		else if (marker === 0xce) [last, at] = [bytes.readUInt32BE(at + 1), at + 5];
		else if (marker === 0xcf) [last, at] = [Number(bytes.readBigUInt64BE(at + 1)), at + 9];
		else return undefined;
	}

	return (bytes[0] & 0xf0) === 0x90 ? last : undefined;
};

/** One GraphQL query for each repository's details and its newest releases, as many as REST gives on a page. */
export const repositoriesQuery = (names, releases) =>
	`query { ${names
		.map((name, at) => {
			const [owner, repository] = name.split('/');

			return `r${at}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repository)}) { nameWithOwner description stargazerCount isArchived isFork parent { nameWithOwner } licenseInfo { spdxId } createdAt pushedAt releases(first: ${releases}, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { tagName publishedAt isPrerelease isDraft description releaseAssets(first: ${ASSETS}) { nodes { id name size downloadUrl downloadCount } } } } }`;
		})
		.join(' ')} }`;

/**
 * A repository as GraphQL answers it, in the shapes REST answers it in: its details as the repository request keeps
 * them, and its releases as the first page of the releases request does, notes trimmed by `notes`.
 */
export const fromGraphql = (node, notes) => ({
	repo: {
		full_name: node.nameWithOwner,
		description: node.description,
		stargazers_count: node.stargazerCount,
		archived: node.isArchived,
		// REST names a license it cannot match NOASSERTION, where GraphQL leaves it null
		license: node.licenseInfo && { spdx_id: node.licenseInfo.spdxId ?? 'NOASSERTION' },
		created_at: node.createdAt,
		pushed_at: node.pushedAt,
		parent: node.parent ? { full_name: node.parent.nameWithOwner } : undefined,
		fork: node.isFork,
	},
	releases: node.releases.nodes.map(release => ({
		tag_name: release.tagName,
		published_at: release.publishedAt,
		prerelease: release.isPrerelease,
		draft: release.isDraft,
		body: notes(release.description),
		assets: release.releaseAssets.nodes
			.map(asset => ({
				id: assetIdOf(asset.id),
				name: asset.name,
				size: asset.size,
				browser_download_url: asset.downloadUrl,
				download_count: asset.downloadCount,
			}))
			.sort((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name))),
	})),
});
