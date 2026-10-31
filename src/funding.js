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

	for (const line of yaml.split(/\r?\n/)) {
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

/** The sites a link to which asks for support, by host, to the FUNDING.yml platform each is. */
const SUPPORT_SITES = {
	'ko-fi.com': 'ko_fi',
	'patreon.com': 'patreon',
	'opencollective.com': 'open_collective',
	'liberapay.com': 'liberapay',
	'buymeacoffee.com': 'buy_me_a_coffee',
	'polar.sh': 'polar',
	'thanks.dev': 'thanks_dev',
	'paypal.me': 'custom',
	'boosty.to': 'custom',
};

/** A link's key that says it is for support, though the site it leads to is not one known for it. */
const SUPPORT_KEY = /donat|sponsor|patreon|kofi|ko-fi|paypal|coffee|funding|\btips?$/i;

const platformOf = ({ name, url }) => {
	const { hostname, pathname } = new URL(url);
	const host = hostname.replace(/^www\./, '');

	if (host === 'github.com' && pathname.startsWith('/sponsors/')) return 'github';
	if (host === 'paypal.com' && /^\/(donate|paypalme)/.test(pathname)) return 'custom';
	if (SUPPORT_SITES[host]) return SUPPORT_SITES[host];

	return SUPPORT_KEY.test(name) ? 'custom' : undefined;
};

/** Where discovery keeps the donation links of Modrinth projects, by the mod each links as its source. */
export const DONATIONS = 'modrinth-funding.json';

const modKey = line => (line.includes(':') ? line : `github:${line}`).toLowerCase();

/** Donation links by repos.txt line, keyed as the index names a mod, `host:owner/repo`, in any case. */
export const donationsByMod = byLine => new Map([...byLine].map(([line, links]) => [modKey(line), links]));

/** The donation links Modrinth gives for a mod, by its host and repository. */
export const donationsOf = (donations, { host, repo }) => donations[modKey(`${host}:${repo}`)] ?? [];

/** A project's donation links, as Modrinth keeps them: each an http(s) address, by the site it leads to. */
export const donationLinks = addresses =>
	addresses
		.filter(url => /^https?:\/\//i.test(url))
		.map(url => ({ platform: platformOf({ name: 'donation', url }), url }));

/**
 * Of the links a jar's mods give, those that ask for support, as FUNDING.yml's are: by the site they lead to, or a key
 * that says so.
 */
export const supportLinks = links =>
	links.map(link => ({ platform: platformOf(link), url: link.url })).filter(({ platform }) => platform !== undefined);

/** The path segments a support site puts before a person's handle. */
const HANDLE_PREFIXES = new Set(['c', 'cw', 'sponsors', 'u', 'r']);

/** Whose page a support link leads to, as the site spells their handle. */
export const handleOf = url => {
	const segments = new URL(url).pathname.split('/').filter(Boolean);

	return segments.find(segment => !HANDLE_PREFIXES.has(segment.toLowerCase()));
};

const spelled = name => name.toLowerCase().replace(/[-_.]/g, '');

/** Of these support links, the ones to this person's own page: the handle is their login, whatever its case or separators. */
export const linksOf = (links, login) =>
	links.filter(({ url }) => {
		const handle = handleOf(url);

		return handle !== undefined && spelled(handle) === spelled(login);
	});

const ADDRESS = /https?:\/\/[^\s)"'<>\]]+/gi;

/** The links in a readme to a site known for support, each once: whose they are is for the caller to say. */
export const readmeSupport = markdown => {
	const seen = new Set();

	return supportLinks(
		(markdown.match(ADDRESS) ?? []).map(url => ({ name: 'readme', url: url.replace(/[.,]+$/, '') })),
	).filter(({ url }) => !seen.has(url) && seen.add(url));
};

/**
 * The links GitHub reads from FUNDING.yml files, as it gives them for each repository, in the index's form: a GitHub
 * handle leads to its Sponsors page, and only a web address is kept.
 */
export const fundingLinksOf = links => {
	const seen = new Set();

	return links
		.map(({ platform, url }) => {
			const key = platform.toLowerCase();

			return key === 'github'
				? { platform: key, url: `https://github.com/sponsors/${handleOf(url)}` }
				: { platform: key, url };
		})
		.filter(({ url }) => /^https?:\/\//i.test(url) && !seen.has(url) && seen.add(url));
};
