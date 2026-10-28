import { providerOf } from 'ender-launcher/rank';

/** The issue form's fields, by the labels GitHub writes as headings into the issue it files. */
export const FIELDS = { mods: 'Mods it shows', picture: 'Picture', story: 'Story' };

/** Where GitHub keeps what is dragged into an issue: the only pictures a shot is taken from. */
const ATTACHMENT = /https:\/\/(?:github\.com\/user-attachments\/assets|user-images\.githubusercontent\.com)\/[\w./-]+/;

const HOSTS = { 'github.com': 'github', 'codeberg.org': 'codeberg', 'gitlab.com': 'gitlab' };

const SPECS = { gh: 'github', cb: 'codeberg', gl: 'gitlab' };

/** An issue form's answers by field, with what GitHub writes for one left empty read as nothing. */
export const fieldsOf = body => {
	const fields = {};

	for (const section of `\n${body ?? ''}`.replaceAll('\r\n', '\n').split('\n### ').slice(1)) {
		const [label, ...value] = section.split('\n');
		const answer = value.join('\n').trim();

		fields[label.trim()] = answer === '_No response_' ? '' : answer;
	}

	return fields;
};

/** The picture an answer holds, when GitHub is keeping it. */
export const pictureIn = answer => answer?.match(ATTACHMENT)?.[0];

const keyOf = entry => `${entry.host ?? 'github'}:${entry.repo}`;

const plain = text => text.toLowerCase().replaceAll(/[^a-z\d]/g, '');

/**
 * The listing's key for a mod as a player named it: by key or spec, by a link to its index page or its repository, by
 * its mod id, or by its name, the most starred mod of that name first.
 */
export const modNamed = (line, listing) => {
	const text = line.replace(/^[-*]\s+/, '').trim();
	const known = new Set(listing.map(keyOf));
	const asKey = (host, repo) => {
		const parts = repo
			.replace(/\.git$/, '')
			.split('/')
			.filter(Boolean);

		for (let end = parts.length; end >= 2; end--) {
			const key = `${host}:${parts.slice(0, end).join('/')}`;

			if (known.has(key)) return key;
		}

		return undefined;
	};

	if (!text) return undefined;

	const spelled = text.match(/^(github|codeberg|gitlab|gh|cb|gl):(\S+)$/);

	if (spelled) return asKey(SPECS[spelled[1]] ?? spelled[1], spelled[2]);

	const page = text.match(/#\/mod\/(github|codeberg|gitlab)\/([^/]+)\/([^/?#\s]+)/);

	if (page) return asKey(page[1], `${decodeURIComponent(page[2])}/${decodeURIComponent(page[3])}`);

	if (/^https?:\/\//.test(text)) {
		const url = URL.parse(text);
		const host = url && HOSTS[url.hostname.replace(/^www\./, '')];

		return host && asKey(host, url.pathname.split('/-/')[0]);
	}

	const byId = providerOf(text.toLowerCase(), listing);

	if (byId) return keyOf(byId);

	const named = listing
		.filter(entry => (entry.latest?.mods ?? []).some(mod => mod.name && plain(mod.name) === plain(text)))
		.toSorted((a, b) => (b.stars ?? 0) - (a.stars ?? 0))[0];

	return named && keyOf(named);
};

/** A shot as its issue answers the form, and what in it does not read, for the reviewer to fix. */
export const shotOf = (issue, listing) => {
	const fields = fieldsOf(issue.body);
	const named = (fields[FIELDS.mods] ?? '')
		.split('\n')
		.filter(line => line.trim())
		.map(line => [line.trim(), modNamed(line, listing)]);
	const picture = pictureIn(fields[FIELDS.picture]);
	const problems = [
		...named.filter(([, found]) => !found).map(([line]) => `${line} is not a mod the index lists`),
		...(named.some(([, found]) => found) ? [] : ['It names no mod the index lists']),
		...(picture ? [] : ['It has no picture dragged or pasted in']),
		...(fields[FIELDS.story] ? [] : ['It has no story']),
	];

	return {
		problems,
		shot: {
			id: issue.number,
			story: fields[FIELDS.story] ?? '',
			by: issue.user?.login,
			at: issue.created_at,
			issue: issue.html_url,
			mods: [...new Set(named.map(([, found]) => found).filter(Boolean))],
		},
		picture,
	};
};
