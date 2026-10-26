/**
 * GitHub's FUNDING.yml keys, each to the page a handle names there. GitHub documents these; Codeberg and GitLab
 * projects that keep the file use the same keys.
 */
const PLATFORMS = {
	github: name => `https://github.com/sponsors/${name}`,
	patreon: name => `https://www.patreon.com/${name}`,
	open_collective: name => `https://opencollective.com/${name}`,
	ko_fi: name => `https://ko-fi.com/${name}`,
	liberapay: name => `https://liberapay.com/${name}`,
	buy_me_a_coffee: name => `https://buymeacoffee.com/${name}`,
	polar: name => `https://polar.sh/${name}`,
	thanks_dev: name => `https://thanks.dev/${name}`,
	issuehunt: name => `https://issuehunt.io/r/${name}`,
	tidelift: name => `https://tidelift.com/funding/github/${name}`,
	community_bridge: name => `https://crowdfunding.lfx.linuxfoundation.org/projects/${name}`,
	lfx_crowdfunding: name => `https://crowdfunding.lfx.linuxfoundation.org/projects/${name}`,
};

/** A handle a platform's page can be named by; anything else in the file is not taken as one. */
const HANDLE = /^[\w.-]+(\/[\w.-]+)?$/;

const unquote = value => value.trim().replace(/^["']|["']$/g, '');

const valuesOf = value => {
	const trimmed = value.trim();

	if (trimmed === '') return [];
	if (trimmed.startsWith('['))
		return trimmed.slice(1, trimmed.lastIndexOf(']')).split(',').map(unquote).filter(Boolean);

	return [unquote(trimmed)];
};

const linkFor = (platform, value) => {
	if (platform === 'custom') {
		try {
			const url = new URL(value);

			return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
		} catch {
			return undefined;
		}
	}

	return PLATFORMS[platform] && HANDLE.test(value) ? PLATFORMS[platform](value) : undefined;
};

/**
 * The links a FUNDING.yml names, in its order, as { platform, url }. The file is anyone's, so only a known platform's
 * handle, or an http(s) address for custom, becomes a link.
 */
export const parseFunding = yaml => {
	const links = [];
	let listing;

	for (const line of yaml.split('\n')) {
		const text = line.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
		const item = text.match(/^\s+-\s*(.+)$/);
		const pair = text.match(/^([a-z_]+)\s*:\s*(.*)$/i);

		if (item && listing) {
			links.push({ platform: listing, value: unquote(item[1]) });
		} else if (pair) {
			listing = pair[1].toLowerCase();
			for (const value of valuesOf(pair[2])) links.push({ platform: listing, value });
		}
	}

	const seen = new Set();

	return links
		.map(({ platform, value }) => ({ platform, url: linkFor(platform, value) }))
		.filter(({ url }) => url !== undefined && !seen.has(url) && seen.add(url));
};

/** Where a repository's FUNDING.yml may be, in the order GitHub looks. */
export const FUNDING_PATHS = ['.github/FUNDING.yml', 'FUNDING.yml', 'docs/FUNDING.yml'];
