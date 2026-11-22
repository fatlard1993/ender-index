import {
	Button,
	Card,
	Component,
	Content,
	EmptyState,
	Input,
	Link,
	SectionLabel,
	Select,
	Tabs,
	View,
	styled,
	theme,
} from '@vanilla-bean/components';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { HOSTS, authorOf, ownerOf, sharing } from 'ender-launcher/rank';
import { SCANNER_VERSION } from 'ender-launcher/scannerVersion';
import { ownerName } from 'ender-launcher/support';

import { collection } from './collection';
import { loadExplanations, loadListing, loadPacks, loadShots, loadVersions } from './data';
import { explainUrl, rescanUrl } from './forms';
import { uncovered } from './evidence';
import { libraryOf } from './libraries';
import { packCard } from './packs';
import { shareUrl } from './shots';
import {
	BUILT_FROM_SOURCE,
	CAPABILITIES,
	LEVELS,
	WARNINGS,
	byLevel,
	guideOf,
	findingLabel,
	secretsSentence,
	INDEX,
	collectionKey,
	contributorSupportOf,
	LOADERS,
	aboutOf,
	authorPath,
	lineUrl,
	rangeLabel,
	readmeSources,
	screenshotsOf,
	slug,
	tagPath,
	supportOf,
	fileSize,
	installCommand,
	loadersOf,
	modPath,
	pictureUrl,
	readQuery,
	readmeUrl,
	recordUrl,
	releaseUrl,
	repositoryUrl,
	shareOf,
	titleOf,
	writeQuery,
} from './search';
import {
	bestDownload,
	downloadLoaders,
	downloadVersions,
	downloadsOf,
	matchingDownloads,
	clashesWith,
	neededBy,
	needsOf,
	sameAuthor,
	similarTo,
	worksWith,
} from './related';
import { askControl, collectButton, installControls, starButton } from './controls';
import { local } from './local';
import {
	Alarm,
	Chip,
	Command,
	Meta,
	Row,
	Stack,
	Title,
	Warning,
	about,
	avatar,
	count,
	date,
	fetchReadme,
	LAUNCHER,
	authorsPath,
	lightbox,
	plainClick,
	forStrangers,
	findingsPath,
	siteBar,
	stat,
	loadJson,
	TILES,
	tiles,
	siteFooter,
} from './ui';
import { hrefOf } from './route';

/** A readme as its host would show it, kept to this column: wide images and tables scale or scroll, never the page. */
export const Prose = styled.Component(
	({ colors, radius, space }) => `
		line-height: 1.55;
		overflow-wrap: anywhere;

		& img, & video {
			max-width: 100%;
			height: auto;
		}

		& h1, & h2, & h3 {
			border-bottom: 1px solid ${colors.border};
			padding-bottom: ${space.xs};
		}

		& pre {
			background: ${colors.overlay};
			border-radius: ${radius.sm};
			padding: ${space.md};
			overflow-x: auto;
		}

		& code {
			background: ${colors.overlay};
			border-radius: ${radius.sm};
			padding: 0 ${space.xs};
		}

		& pre code {
			padding: 0;
			background: none;
		}

		& table {
			display: block;
			overflow-x: auto;
			border-collapse: collapse;
		}

		& th, & td {
			border: 1px solid ${colors.border};
			padding: ${space.xs} ${space.sm};
		}

		& blockquote {
			margin: 0;
			padding-left: ${space.md};
			border-left: 3px solid ${colors.border};
			color: ${colors.muted};
		}

		& a {
			color: ${colors.accent};
		}
	`,
);

const HEADING_PREFIX = 'readme-';

/** A form in a readme would post from this page's origin, which under ender web is the origin its api trusts. */
const FORM_TAGS = ['form', 'input', 'button', 'select', 'textarea', 'option'];

/**
 * A readme as safe markup: it is anyone's HTML, so it is sanitized before it is shown, links leave in a new tab, and
 * every relative image and link is pointed back at its repository.
 * @param {string} markdown - The readme
 * @param {object} sources - Where its relative images (`raw`) and links (`page`) point
 * @param {Window} [root] - The window whose HTML parser sanitizes it: the page's own, unless a test gives another
 * @returns {string} The safe markup
 */
export const renderReadme = (markdown, sources, root = window) => {
	const renderer = new marked.Renderer();

	renderer.heading = function ({ tokens, depth }) {
		const text = this.parser.parseInline(tokens);

		return `<h${depth} id="${HEADING_PREFIX}${slug(text.replace(/<[^>]+>/g, ''))}">${text}</h${depth}>`;
	};

	const purify = DOMPurify(root);

	purify.addHook('afterSanitizeAttributes', node => {
		if (node.hasAttribute('src')) node.setAttribute('src', readmeUrl(node.getAttribute('src'), sources.raw));

		if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy');

		if (node.tagName === 'A' && node.hasAttribute('href')) {
			const href = node.getAttribute('href');

			if (href.startsWith('#')) node.setAttribute('href', `#${HEADING_PREFIX}${href.slice(1)}`);
			else {
				node.setAttribute('href', readmeUrl(href, sources.page));
				node.setAttribute('target', '_blank');
				node.setAttribute('rel', 'noopener noreferrer');
			}
		}
	});

	return purify.sanitize(marked.parse(markdown, { renderer, gfm: true }), {
		ADD_ATTR: ['target'],
		FORBID_TAGS: FORM_TAGS,
	});
};

/** An author's explanation of a finding, set apart from it and said to be theirs: the index has not checked it. */
const AuthorsWord = styled.Component(
	({ colors, space }) => `
		margin-left: ${space.md};
		padding-left: ${space.md};
		border-left: 3px solid ${colors.accent};
		display: flex;
		flex-direction: column;
		gap: ${space.xs};
	`,
);

/**
 * An author's explanation beside the finding it answers, and, when the jar holds more of that finding than the
 * explanation covered when it was approved, what it does not cover: a host it never named, a call it never made.
 */
const authorsWord = (note, asset, finding) => {
	const drift = note ? uncovered(asset, finding, note.covers) : [];

	return note
		? [
				new AuthorsWord({
					append: [
						new Meta({
							tag: 'div',
							append: [
								'From its author, ',
								new Link({ href: note.issue, target: '_blank', textContent: note.by }),
								note.release ? `, written for ${note.release}` : '',
							],
						}),
						new Component({ tag: 'p', textContent: note.text, style: { margin: 0, whiteSpace: 'pre-line' } }),
						new Meta({ tag: 'div', textContent: 'Their own words, which the index has not checked.' }),
						...(drift.length > 0
							? [
									new Warning({
										tag: 'div',
										textContent: `Written for ${note.release ?? 'an earlier release'}, it does not cover what this jar has since: ${drift.slice(0, DRIFT_SHOWN).join(', ')}${drift.length > DRIFT_SHOWN ? `, and ${drift.length - DRIFT_SHOWN} more` : ''}`,
									}),
								]
							: []),
					],
				}),
			]
		: [];
};

const DRIFT_SHOWN = 5;

/**
 * The classes behind a finding, the mod's own first, then those of each library it bundles under that library's name:
 * a jar inside it for certain, or a package that looks like a library's, which is said to be a guess.
 */
const evidenceLines = classes => {
	const own = Object.entries(classes).filter(([where]) => !libraryOf(where));
	const bundled = Object.groupBy(
		Object.entries(classes).filter(([where]) => libraryOf(where)),
		([where]) => {
			const { name, certain } = libraryOf(where);

			return certain ? `In ${name}, a library it bundles:` : `In what looks like ${name}, a library it bundles:`;
		},
	);
	const line = ([where, via]) =>
		new Meta({
			tag: 'div',
			style: { marginLeft: theme.space.md },
			textContent: `${where.split('!').at(-1)}: ${via.join(', ')}`,
		});

	return [
		...own.map(line),
		...Object.entries(bundled).flatMap(([heading, lines]) => [
			new Meta({ tag: 'div', style: { marginLeft: theme.space.md }, textContent: heading }),
			...lines.map(line),
		]),
	];
};

/** A link that stands for a line of its own, rather than running on from whatever is beside it. */
const onItsOwnLine = link => new Component({ tag: 'div', append: link });

/** One finding folded: its name and what it means, a link to more, the classes behind it, and its author's word. */
const capitalized = text => `${text[0].toUpperCase()}${text.slice(1)}`;

/** A finding's level, as a chip colored by how much it should make a player look. */
const levelChip = name =>
	new Chip({
		addClass: guideOf(name).level,
		textContent: LEVELS[guideOf(name).level],
		style: { display: 'inline-block' },
	});

/**
 * One finding folded: how much it matters and what it usually means, in plain words; opened, its own name, a link to
 * more, the classes behind it, and its author's word.
 */
const findingDetails = ({ asset, name, technical, linkText, classes, note }) => {
	const guide = guideOf(name);
	const details = new Component({ tag: 'details', style: { overflowWrap: 'anywhere' } });
	const libraries = Object.keys(classes).map(libraryOf);
	const onlyBundled = libraries.length > 0 && libraries.every(Boolean);
	const surely = libraries.every(library => library?.certain);

	details.append(
		new Component({
			tag: 'summary',
			append: [
				levelChip(name),
				' ',
				new Component({ tag: 'strong', textContent: capitalized(guide.label) }),
				guide.meaning ? `: ${guide.meaning}` : '',
				...(onlyBundled
					? [
							new Meta({
								tag: 'span',
								textContent: surely
									? ' · only in libraries it bundles'
									: ' · only in what look like libraries it bundles',
							}),
						]
					: []),
			],
		}),
		new Meta({ tag: 'div', textContent: technical ? `${name}: ${technical}` : name }),
		onItsOwnLine(new Link({ href: findingsPath(name), textContent: linkText })),
		...evidenceLines(classes),
		...authorsWord(note, asset, name),
	);

	return details;
};

const capabilityList = (asset, explained) => {
	const { scan, unsourced } = asset;

	return [
		...Object.entries(scan?.capabilities ?? {}).map(([capability, classes]) =>
			findingDetails({
				asset,
				name: capability,
				technical: CAPABILITIES[capability],
				linkText: `What reaching ${capability} means`,
				classes,
				note: explained[capability],
			}),
		),
		...Object.entries(scan?.signals ?? {}).map(([signal, classes]) =>
			findingDetails({
				asset,
				name: signal,
				technical: WARNINGS[signal],
				linkText: `What ${/^[aeiou]/.test(signal) ? 'an' : 'a'} ${signal} warning means`,
				classes,
				note: explained[signal],
			}),
		),
		...((scan?.hidden ?? []).length > 0
			? [
					findingDetails({
						asset,
						name: 'hidden',
						technical: WARNINGS.hidden,
						linkText: 'What hidden code means',
						classes: Object.fromEntries(scan.hidden.map(where => [where, ['a jar or class by its bytes']])),
						note: explained.hidden,
					}),
				]
			: []),
		...(unsourced
			? [
					findingDetails({
						asset,
						name: 'unsourced',
						technical: WARNINGS.unsourced,
						linkText: 'What unsourced classes mean',
						classes: Object.fromEntries(
							unsourced.classes.map(where => [where, ['no source for it in the repository at this release']]),
						),
						note: explained.unsourced,
					}),
				]
			: []),
	];
};

/** What no mod has a reason to do, said outright beside the jar rather than folded among the findings. */
const secretsAlarm = (asset, explained = {}) => {
	const { scan } = asset;
	const stores = Object.keys(scan?.secrets ?? {});

	if (stores.length === 0) return [];

	return [
		new Alarm({
			append: [
				new Component({ tag: 'strong', textContent: secretsSentence(stores) }),
				...stores.flatMap(store => evidenceLines(scan.secrets[store])),
				new Link({ href: findingsPath('secrets'), textContent: 'What this means, and what to do' }),
				...authorsWord(explained.secrets, asset, 'secrets'),
			],
		}),
	];
};

/** Which scanner read a jar, with a way to have the newest read it when that is not the one. */
const scannerLine = (asset, entry) => {
	const version = asset.scan?.version ?? 1;

	if (!asset.scan || version >= SCANNER_VERSION) return [];

	return [
		new Meta({
			tag: 'div',
			append: [
				`Read by scanner version ${version}; the newest, version ${SCANNER_VERSION}, looks for more. `,
				new Link({ href: rescanUrl(entry), target: '_blank', textContent: 'Ask for a rescan' }),
			],
		}),
	];
};

/** A host given as a bare address names no one, which is worth seeing apart from a host with a name. */
const hostLabel = host => (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? `${host} (an address, not a name)` : host);

const groupLabel = (label, mods) =>
	new SectionLabel({
		textContent: mods.length > TILES ? `${label} (${count(mods.length)}, the most starred ${TILES})` : label,
	});

/**
 * What it needs and what needs it, what its author or theirs says works with it or does not, and other authors' mods
 * sharing its themes: the empty ones left out.
 */
const relatedGroups = (entry, listing) => {
	const needs = needsOf(entry, listing);
	const needed = neededBy(entry, listing);
	const works = worksWith(entry, listing);
	const clashes = clashesWith(entry, listing);
	const alike = similarTo(entry, listing, { leaving: [...needs, ...needed, ...works, ...clashes] });

	const missing = notIndexed(entry);

	return [
		['What it needs', needs, missing],
		['What needs it', needed],
		['Works with', works],
		['Does not work with', clashes],
		['Alike in theme', alike],
	]
		.filter(([, mods, more = []]) => mods.length > 0 || more.length > 0)
		.flatMap(([label, mods, more = []]) => [
			groupLabel(label, mods),
			...(mods.length > 0 ? [tiles(mods)] : []),
			...more,
		]);
};

/** What it needs that the index has no repository it can trust for, each linked to its source when that is known. */
const notIndexed = entry => {
	const missing = entry.missing ?? [];

	if (missing.length === 0) return [];

	return [
		new Meta({
			tag: 'p',
			append: [
				'Not in the index, as its jars are not on releases the crawl reads: ',
				...missing.flatMap(({ id, source }, at) => [
					...(at > 0 ? [', '] : []),
					source
						? new Link({ href: lineUrl(source), target: '_blank', textContent: id, tooltip: `Its source, ${source}` })
						: id,
				]),
			],
		}),
	];
};

const Pictures = styled.Component(
	({ colors, radius, space }) => `
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
		gap: ${space.sm};

		& img {
			display: block;
			width: 100%;
			aspect-ratio: 16 / 10;
			object-fit: cover;
			border-radius: ${radius.md};
			background: ${colors.raised};
		}
	`,
);

const PICTURES_SHOWN = 40;

/**
 * Every picture of the mod its readme shows and its repository keeps, each opening large in a dialog that steps
 * through those still showing; one that does not load is let go.
 */
const pictureGrid = (title, shots) => {
	const grid = new Pictures({
		append: shots.map(url => {
			const link = new Link({
				href: url,
				target: '_blank',
				attributes: { rel: 'noopener noreferrer' },
				tooltip: 'Show it large',
				append: new Component({
					tag: 'img',
					attributes: { src: url, alt: `A picture of ${title}`, loading: 'lazy', referrerpolicy: 'no-referrer' },
				}),
			});

			link.elem.querySelector('img').addEventListener('error', () => link.elem.remove());
			link.onPointerPress(event => {
				if (!plainClick(event)) return;

				event.preventDefault();

				const showing = [...grid.elem.querySelectorAll('a')].map(found => found.href);

				lightbox(
					title,
					showing.map(found => ({ url: found })),
					showing.indexOf(link.elem.href),
				);
			});

			return link;
		}),
	});

	return [grid];
};

const Story = styled.Component(
	({ space }) => `
		white-space: pre-line;
		margin: 0;
		margin-top: ${space.xs};
	`,
);

const shotUrl = shot => `${INDEX}/${shot.image}`;

/** Who shared a shot and when, and the other indexed mods it shows. */
const sharedBy = (title, shot, byKey) => {
	const others = (shot.mods ?? []).map(key => byKey.get(key)).filter(entry => entry && titleOf(entry) !== title);

	return new Meta({
		append: [
			'From ',
			new Link({ href: shot.issue, target: '_blank', textContent: shot.by }),
			...(shot.at ? [`, ${date(shot.at)}`] : []),
			...others.flatMap((entry, at) => [
				at === 0 ? '. It shows ' : ', ',
				new Link({ href: hrefOf(modPath(entry)), textContent: titleOf(entry) }),
				...(at === others.length - 1 ? [' too'] : []),
			]),
		],
	});
};

/** A player's shot: the picture, opening large among the rest with their stories, the story told, and who told it. */
const playerShot = (title, shot, shared, byKey) => {
	const url = shotUrl(shot);
	const link = new Link({
		href: url,
		target: '_blank',
		tooltip: 'Show it large',
		append: new Component({
			tag: 'img',
			attributes: { src: url, alt: `A player's shot of ${title}`, loading: 'lazy' },
		}),
	});

	link.onPointerPress(event => {
		if (!plainClick(event)) return;

		event.preventDefault();
		lightbox(
			title,
			shared.map(other => ({
				url: shotUrl(other),
				alt: `A player's shot of ${title}`,
				caption: [new Story({ tag: 'p', textContent: other.story }), sharedBy(title, other, byKey)],
			})),
			shared.indexOf(shot),
		);
	});

	return new Stack({
		style: { gap: 0 },
		append: [
			new Pictures({ style: { gridTemplateColumns: '1fr' }, append: link }),
			new Story({ tag: 'p', textContent: shot.story }),
			sharedBy(title, shot, byKey),
		],
	});
};

/** What players shared of it, each with its story, then where to share one; while they load, or when they did not, that alone. */
const playerShotsOf = (entry, title, { shared, byKey, loading, problem }, retry) => {
	if (loading) return [new EmptyState({ loading: true, title: 'Fetching the shots players shared' })];
	if (problem)
		return [
			new EmptyState({
				icon: 'triangle-exclamation',
				title: 'The shots players shared did not load',
				message: problem,
				action: { textContent: 'Try again', onPointerPress: retry },
			}),
		];

	return [
		...(shared.length > 0
			? [
					new Stack({
						style: { gap: theme.space.lg },
						append: shared.map(shot => playerShot(title, shot, shared, byKey)),
					}),
				]
			: []),
		new Meta({
			tag: 'p',
			append: [
				shared.length > 0 ? 'Played with it? ' : 'No player has shared a shot of it yet. ',
				new Link({ href: shareUrl([collectionKey(entry)]), target: '_blank', textContent: 'Share a shot' }),
				' from your game and the story behind it, with a GitHub account. It shows here once it has been looked over.',
			],
		}),
	];
};

const fitsLabel = ({ minecraft, loader }) =>
	[minecraft && `Minecraft ${minecraft}`, loader && LOADERS[loader]].filter(Boolean).join(' with ') || 'any version';

/**
 * A jar's findings in a line a player can read at a glance: grouped by how much each should make them look, most
 * serious first, each in a few plain words; and, once its author explains any, which they explain and which past the
 * common ones they do not, as a capability a later release picks up has no explanation of its own.
 */
const plainSummary = (found, explained) => {
	const groups = Object.entries(Object.groupBy(found, name => guideOf(name).level))
		.toSorted(([a], [b]) => Object.keys(LEVELS).indexOf(b) - Object.keys(LEVELS).indexOf(a))
		.map(([level, names]) => `${LEVELS[level]}: ${names.map(name => guideOf(name).label).join(', ')}`);
	const answered = found.filter(name => explained[name]).map(name => guideOf(name).label);
	const unanswered = found
		.filter(name => !explained[name] && guideOf(name).level !== 'common')
		.map(name => guideOf(name).label);
	const explaining =
		answered.length === 0
			? []
			: [`its author explains ${answered.join(', ')}${unanswered.length > 0 ? `; not ${unanswered.join(', ')}` : ''}`];

	return [...groups, ...explaining].join(' · ');
};

/**
 * What a jar's scan found, folded: findings to look into, not something every reader needs open. What no mod has a
 * reason to do comes first and is never folded.
 */
const findings = (asset, explained, entry) => {
	const { scan, unsourced } = asset;
	const reached = Object.keys(scan?.capabilities ?? {});
	const warned = [
		...Object.keys(scan?.signals ?? {}),
		...((scan?.hidden ?? []).length > 0 ? ['hidden'] : []),
		...(unsourced ? ['unsourced'] : []),
	];
	const hosts = Object.keys(scan?.hosts ?? {});
	const unreadable = scan?.unreadable ?? [];

	if (reached.length + warned.length + hosts.length + unreadable.length === 0) return secretsAlarm(asset, explained);

	const found = byLevel([
		...reached,
		...warned,
		...(hosts.length > 0 ? ['hosts'] : []),
		...(unreadable.length > 0 ? ['unreadable'] : []),
	]);
	const details = new Component({ tag: 'details', style: { overflowWrap: 'anywhere' } });

	details.append(
		new Component({
			tag: 'summary',
			append: new Meta({ tag: 'span', textContent: plainSummary(found, explained) }),
		}),
		...capabilityList(asset, explained),
		...(hosts.length > 0
			? [
					new Meta({ tag: 'div', textContent: `Names hosts: ${hosts.map(hostLabel).join(', ')}` }),
					onItsOwnLine(new Link({ href: findingsPath('hosts'), textContent: 'What the hosts mean' })),
				]
			: []),
		...authorsWord(hosts.length > 0 && explained.hosts, asset, 'hosts'),
		...(unreadable.length > 0
			? [
					new Meta({ tag: 'div', textContent: `Could not read: ${unreadable.join(', ')}` }),
					onItsOwnLine(new Link({ href: findingsPath('unreadable'), textContent: 'What an unreadable class means' })),
				]
			: []),
		...((entry.host ?? 'github') === 'github'
			? [
					onItsOwnLine(
						new Link({
							href: explainUrl(entry),
							target: '_blank',
							textContent: 'Explain a finding, as its author',
							tooltip: 'Your words shown beside the finding, marked as yours',
						}),
					),
				]
			: []),
	);

	return [...secretsAlarm(asset, explained), details];
};

const downloadRow = ({ asset }, explained, entry) => {
	const mods = asset.mods ?? [];
	const loaders = [...new Set(mods.map(mod => mod.loader).filter(Boolean))];
	const ranges = [...new Set(mods.map(mod => mod.minecraft).filter(Boolean))];

	return new Stack({
		style: { gap: theme.space.xs, paddingLeft: theme.space.md },
		append: [
			new Row({
				append: [
					asset.gone
						? new Component({ tag: 'span', textContent: asset.name })
						: new Link({ href: asset.url, textContent: asset.name, tooltip: 'Download this jar' }),
					...loaders.map(loader => new Chip({ textContent: LOADERS[loader] ?? loader })),
					...ranges.map(
						range => new Chip({ textContent: `Minecraft ${rangeLabel(range)}`, tooltip: `Declared as ${range}` }),
					),
					new Meta({
						textContent: [
							fileSize(asset.size),
							asset.downloads === undefined ? '' : `${count(asset.downloads)} downloads`,
						]
							.filter(Boolean)
							.join(' · '),
					}),
					...(asset.gone ? [new Warning({ textContent: `gone since ${date(asset.gone)}` })] : []),
					...(asset.replaced ? [new Warning({ textContent: 'changed after publishing' })] : []),
				],
			}),
			...(mods.length > 1
				? [
						new Meta({
							tag: 'div',
							textContent: `Holds ${mods.map(mod => `${mod.name ?? mod.id} ${mod.version ?? ''}`.trim()).join(', ')}`,
						}),
					]
				: []),
			...findings(asset, explained, entry),
			...scannerLine(asset, entry),
		],
	});
};

const RELEASES_SHOWN = 3;

/** A release's notes, folded under its jars: rendered as its readme is, its links leading back to its repository. */
const releaseNotes = (release, sources) => {
	if (!release.notes) return [];

	const details = new Component({ tag: 'details', style: { overflowWrap: 'anywhere' } });
	const prose = new Prose();

	prose.elem.innerHTML = renderReadme(release.notes, sources);
	details.append(
		new Component({ tag: 'summary', append: new Meta({ tag: 'span', textContent: 'Release notes' }) }),
		prose,
	);

	return [details];
};

/** A release's findings by name, as the search listing names them: what its jars reach, warn of, and name of secrets. */
const findingNamesOf = release =>
	new Set(
		release.assets.flatMap(({ scan, unsourced }) => [
			...Object.keys(scan?.capabilities ?? {}),
			...Object.keys(scan?.signals ?? {}),
			...((scan?.hidden ?? []).length > 0 ? ['hidden'] : []),
			...(unsourced ? ['unsourced'] : []),
			...Object.keys(scan?.secrets ?? {}).map(store => `secrets:${store}`),
		]),
	);

/**
 * What each release found that the release before it did not, by release: the change a quietly compromised release
 * makes, and the one worth seeing before installing it. A first release has nothing to compare against.
 */
export const gainedByRelease = record => {
	const read = (record.releases ?? []).filter(release => release.assets.some(asset => asset.scan));
	const gained = new Map();

	read.forEach((release, at) => {
		const previous = read[at + 1];

		if (!previous) return;

		const before = findingNamesOf(previous);
		const fresh = [...findingNamesOf(release)].filter(name => !before.has(name));

		if (fresh.length > 0) gained.set(release, { from: previous.tag, fresh });
	});

	return gained;
};

/**
 * The jars the crawl could not read, said whatever the filters choose: a jar with no mods read from it fits no game
 * version, so filtering would hide exactly what nothing could vouch for.
 */
const unreadJars = record => {
	const unread = (record.releases ?? []).flatMap(release =>
		release.assets.filter(asset => asset.error !== undefined && !asset.gone).map(asset => ({ release, asset })),
	);

	if (unread.length === 0) return [];

	return [
		new SectionLabel({ textContent: 'Jars the crawl could not read' }),
		...unread.map(
			({ release, asset }) =>
				new Warning({
					tag: 'div',
					textContent: `${asset.name}, in ${release.tag}, could not be read or scanned, so nothing here says what its code reaches: ${asset.error}`,
				}),
		),
	];
};

/** The jars that match, under the release each came in, newest first; past the first few, folded until asked for. */
const downloadList = (entry, matching, sources, explained, gained = new Map()) => {
	const releases = [...new Set(matching.map(({ release }) => release))];
	const cards = releases.map(
		release =>
			new Card(
				{},
				new Stack({
					style: { gap: theme.space.sm },
					append: [
						new Row({
							append: [
								new Link({
									href: releaseUrl({ ...entry, latest: release }),
									target: '_blank',
									append: new Component({ tag: 'strong', textContent: release.tag }),
								}),
								new Meta({ textContent: date(release.published) }),
								...(release.prerelease ? [new Chip({ textContent: 'prerelease' })] : []),
							],
						}),
						...(gained.has(release)
							? [
									new Warning({
										tag: 'div',
										textContent: `New since ${gained.get(release).from}: ${gained.get(release).fresh.map(findingLabel).join(', ')}`,
									}),
								]
							: []),
						...matching
							.filter(download => download.release === release)
							.map(download => downloadRow(download, explained, entry)),

						...releaseNotes(release, sources),
					],
				}),
			),
	);

	if (cards.length <= RELEASES_SHOWN) return cards;

	const older = new Stack({ style: { display: 'none' }, append: cards.slice(RELEASES_SHOWN) });
	const unfold = new Button({
		variant: 'flat',
		textContent: `Show ${count(cards.length - RELEASES_SHOWN)} older ${cards.length - RELEASES_SHOWN === 1 ? 'release' : 'releases'}`,
		onPointerPress: () => {
			older.elem.style.display = '';
			unfold.elem.remove();
		},
	});

	return [...cards.slice(0, RELEASES_SHOWN), unfold, older];
};

/**
 * The jars to choose from, narrowed by game version, loader and words, and the one to offer first. The version and
 * loader start as the search had them and are written back to the address, so the search keeps them too.
 */
const downloadsPanel = (entry, record) => {
	const downloads = downloadsOf(record);
	const sources = readmeSources(entry, record.readme);
	const choice = { ...readQuery(location.search), text: '' };
	const best = new Row();
	const shown = new Meta();
	const list = new Stack();
	const unread = unreadJars(record);
	let explained = {};
	const gained = gainedByRelease(record);

	const draw = () => {
		const found = bestDownload(downloads, choice);
		const matching = matchingDownloads(downloads, choice);

		history.replaceState(
			null,
			'',
			`${location.pathname}${writeQuery({ ...readQuery(location.search), minecraft: choice.minecraft, loader: choice.loader })}${location.hash}`,
		);
		best.content(
			found
				? [
						new Link({
							variant: 'raised',
							href: found.asset.url,
							textContent: `Download ${found.asset.name}`,
							tooltip: `The newest jar for ${fitsLabel(choice)}`,
						}),
						new Meta({ textContent: `${found.release.tag} · ${date(found.release.published)} · ${fitsLabel(choice)}` }),
					]
				: [new Meta({ textContent: `No jar here is for ${fitsLabel(choice)}` })],
		);
		shown.content(`${count(matching.length)} of ${count(downloads.length)} jars`);
		list.content(
			matching.length > 0
				? downloadList(entry, matching, sources, explained, gained)
				: new EmptyState({
						icon: 'magnifying-glass',
						title: 'No jar matches',
						message: `None of its jars is for ${fitsLabel(choice)}${choice.text ? ` and names "${choice.text}"` : ''}`,
					}),
		);
	};

	const minecraft = new Select({
		options: [{ label: 'Any Minecraft', value: '' }, ...(choice.minecraft ? [choice.minecraft] : [])],
		value: choice.minecraft ?? '',
		style: { width: 'auto' },
		attributes: { 'aria-label': 'Minecraft' },
		onChange: ({ target: { value } }) => {
			choice.minecraft = value || undefined;
			draw();
		},
	});
	const loaders = downloadLoaders(downloads);
	const loader = new Select({
		options: [
			{ label: 'Any loader', value: '' },
			...loaders.map(value => ({ label: LOADERS[value] ?? value, value })),
			...(choice.loader && !loaders.includes(choice.loader)
				? [{ label: LOADERS[choice.loader], value: choice.loader }]
				: []),
		],
		value: choice.loader ?? '',
		style: { width: 'auto' },
		attributes: { 'aria-label': 'Loader' },
		onChange: ({ target: { value } }) => {
			choice.loader = value || undefined;
			draw();
		},
	});
	const text = new Input({
		type: 'search',
		placeholder: 'Filter by release, file or version',
		attributes: { 'aria-label': 'Filter the downloads' },
		style: { flex: '1', minWidth: '12em', width: 'auto' },
		onInput: ({ target: { value } }) => {
			choice.text = value;
			draw();
		},
	});

	loadVersions()
		.then(versions => {
			const offered = downloadVersions(downloads, versions);

			minecraft.options.options = [
				{ label: 'Any Minecraft', value: '' },
				...offered,
				...(choice.minecraft && !offered.includes(choice.minecraft) ? [choice.minecraft] : []),
			];
			minecraft.options.value = choice.minecraft ?? '';
		})
		.catch(() => {});

	draw();

	return {
		best,
		count: downloads.length,
		panel: [new Row({ append: [minecraft, loader, text] }), shown, list, ...unread],
		explain: found => {
			explained = found;
			draw();
		},
	};
};

/** Where a fork came from: the original's page here when the index lists it, otherwise on its host. */
const forkedFrom = entry => {
	const original = { ...entry, repo: entry.forkOf.repo };

	return new Meta({
		tag: 'span',
		append: [
			'a fork of ',
			new Link(
				entry.forkOf.listed
					? { href: hrefOf(modPath(original)), textContent: original.repo }
					: { href: repositoryUrl(original), target: '_blank', textContent: original.repo },
			),
		],
	});
};

/** How the author of the project a fork came from takes support, said as theirs, not the fork's. */
const originalSupport = entry => [
	new SectionLabel({ level: 2, textContent: `Support the author of ${entry.forkOf.repo}` }),
	new Row({
		append: supportOf(entry.forkOf).map(
			({ url, label }) =>
				new Link({
					variant: 'raised',
					href: url,
					target: '_blank',
					attributes: { rel: 'noopener noreferrer' },
					textContent: label,
				}),
		),
	}),
	new Meta({
		tag: 'p',
		textContent: `It is a fork of ${entry.forkOf.repo}, whose author made what it was forked from.`,
	}),
];

const ContributorGrid = styled.Component(
	({ space }) => `
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
		gap: ${space.md};
	`,
);

/** A contributor's part of the commits, drawn as a filled share of a track. */
const ShareTrack = styled.Component(
	({ colors }) => `
		height: 6px;
		border-radius: 3px;
		background: ${colors.border};
		overflow: hidden;

		& > span {
			display: block;
			height: 100%;
			background: ${colors.accent};
		}
	`,
);

const takesSupport = person => person.funding?.length > 0;

/** One contributor: who they are, their part of the commits, their mods here, and how they take support. */
const contributorCard = ({ entry, person, commits, listing }) => {
	const login = person.login.toLowerCase();
	const theirs = { host: 'github', repo: `${person.login}/_` };
	const mods = listing.filter(other => ownerOf(other) === ownerOf(theirs)).length;
	const share = commits > 0 ? (person.commits / commits) * 100 : 0;

	return new Card(
		{ style: { height: '100%' } },
		new Stack({
			style: { gap: theme.space.sm },
			append: [
				new Row({
					style: { flexWrap: 'nowrap', alignItems: 'center', gap: theme.space.md },
					append: [
						avatar(`https://github.com/${person.login}.png?size=96`, 48),
						new Stack({
							style: { flex: '1', minWidth: '0', gap: '0' },
							append: [
								new Link({
									href: `https://github.com/${person.login}`,
									target: '_blank',
									append: new Title({ textContent: person.name ?? person.login }),
								}),
								...(person.name ? [new Meta({ textContent: `@${person.login}` })] : []),
							],
						}),
					],
				}),
				new Row({
					append: [
						...(entry.repo.split('/')[0].toLowerCase() === login ? [new Chip({ textContent: 'owner' })] : []),
						...(takesSupport(person) ? [new Chip({ addClass: 'installed', textContent: 'takes support' })] : []),
					],
				}),
				new ShareTrack({ append: new Component({ tag: 'span', style: { width: `${Math.max(share, 1)}%` } }) }),
				new Meta({
					textContent: `${count(person.commits)} ${person.commits === 1 ? 'commit' : 'commits'} · ${shareOf(person.commits, commits)} of them`,
				}),
				...(mods > 0
					? [
							new Link({
								href: authorPath(theirs),
								textContent: `${count(mods)} ${mods === 1 ? 'mod' : 'mods'} of theirs in the index`,
							}),
						]
					: []),
				...(takesSupport(person)
					? [
							new Row({
								append: contributorSupportOf(person).map(
									({ url, label }) =>
										new Link({
											variant: 'raised',
											href: url,
											target: '_blank',
											attributes: { rel: 'noopener noreferrer' },
											textContent: label,
										}),
								),
							}),
						]
					: []),
			],
		}),
	);
};

/**
 * Who made a mod, the most commits first, each on a card; with a choice of only those who take support when some do
 * and some do not, which `onlySupported` makes from outside.
 */
const contributorsPanel = (entry, { commits, more, people }, listing) => {
	const supported = people.filter(takesSupport);
	const grid = new ContributorGrid();
	const draw = only =>
		grid.content((only ? supported : people).map(person => contributorCard({ entry, person, commits, listing })));
	const filter =
		supported.length > 0 && supported.length < people.length
			? new Tabs({
					variant: 'segmented',
					tabs: [
						{ id: 'everyone', label: 'Everyone', count: people.length + more },
						{ id: 'supported', label: 'Take support', count: supported.length },
					],
					selected: 'everyone',
					onChange: ({ value }) => draw(value === 'supported'),
				})
			: undefined;

	draw(false);

	return {
		elements: [
			new Meta({
				tag: 'p',
				textContent:
					'Who made its commits, as GitHub counts them on its default branch, and how each takes support: their own FUNDING.yml, GitHub Sponsors, a support site their profile links, or the readme linking their page.',
			}),
			...(filter ? [filter] : []),
			grid,
			...(more > 0
				? [
						new Link({
							href: `${repositoryUrl(entry)}/graphs/contributors`,
							target: '_blank',
							textContent: `and ${count(more)} more, on GitHub`,
						}),
					]
				: []),
		],
		onlySupported: () => {
			if (filter) filter.options.selected = 'supported';

			draw(true);
		},
	};
};

export default class ModPage extends View {
	static schema = { host: {}, owner: {}, name: {} };

	build() {
		const repo = `${this.options.owner}/${this.options.name}`;
		const host = this.options.host;
		const body = new Stack({ append: new EmptyState({ loading: true, title: `Loading ${repo}` }) });

		this.bar = siteBar('mods', { label: repo });
		this.content([
			this.bar,
			new Content({ column: 900, style: { paddingBlock: theme.space.md }, append: [body, siteFooter()] }),
		]);

		const { signal } = this;

		loadListing()
			.then(async listing => {
				const entry = listing.find(found => found.repo === repo && (found.host ?? 'github') === host);

				if (entry === undefined) {
					body.content(
						new EmptyState({
							icon: 'magnifying-glass',
							title: `${repo} is not in the index`,
							message: 'It may have been archived, or it has no release with a mod jar the crawl could read',
						}),
					);

					return;
				}

				const record = await loadJson(recordUrl(entry), signal);

				if (signal.aborted) return;

				this.show(entry, record, listing);
			})
			.catch(error => {
				if (signal.aborted) return;

				body.content(
					new EmptyState({
						icon: 'triangle-exclamation',
						title: 'The index did not load',
						message: error.message,
						action: { textContent: 'Try again', onPointerPress: () => this.render() },
					}),
				);
			});

		this.body = body;
	}

	show(entry, record, listing) {
		const { signal } = this;
		const title = titleOf(entry);
		const command = installCommand(entry);
		const readme = new Stack({ append: new EmptyState({ loading: true, title: 'Fetching the readme' }) });
		const gallery = new Stack();
		const players = new Stack();
		const controlsFor = () => [collectButton(entry), ...starButton(entry), ...installControls(entry)];
		const controls = new Row({ append: controlsFor() });
		const redrawControls = () => controls.content(controlsFor());
		const downloads = downloadsPanel(entry, record);
		const others = sameAuthor(entry, listing);
		const related = relatedGroups(entry, listing);
		const owner = ownerName(entry);
		const sources = readmeSources(entry, record.readme);
		const pictures = (record.pictures ?? []).map(path => sources.raw(path, { root: true }));
		const contributing = record.contributors
			? contributorsPanel(entry, record.contributors, listing)
			: { elements: [], onlySupported: () => {} };
		const panels = {
			readme,
			gallery,
			players,
			downloads: new Stack({
				append: [
					new Meta({
						tag: 'p',
						append: [
							'The newest releases with jars, each jar downloaded and read by the crawl. What its code can reach is a finding, not a verdict: an update checker reaches the network. ',
							new Link({ href: findingsPath(), textContent: 'What each finding means' }),
						],
					}),
					...downloads.panel,
				],
			}),
			related: new Stack({ append: related }),
			packs: new Stack(),
			contributors: new Stack({ append: contributing.elements }),
			author: new Stack({
				append: [
					tiles(others, others.length),
					new Link({ href: authorPath(entry), textContent: `Every mod of ${owner}'s, in the search` }),
				],
			}),
		};
		const funded = (record.contributors?.people ?? []).filter(takesSupport);
		const contributorCount = (record.contributors?.people.length ?? 0) + (record.contributors?.more ?? 0);
		const tabsFor = ({ shared, pictures: shots, packs = [] }) => [
			{ id: 'readme', label: 'Readme' },
			...(shots.length > 0 ? [{ id: 'gallery', label: 'Gallery', count: shots.length }] : []),
			{ id: 'players', label: 'Player shots', count: shared.length },
			{ id: 'downloads', label: 'Downloads', count: downloads.count },
			...(related.length > 0 ? [{ id: 'related', label: 'Related' }] : []),
			...(packs.length > 0 ? [{ id: 'packs', label: 'Packs', count: packs.length }] : []),
			...(contributorCount > 0 ? [{ id: 'contributors', label: 'Contributors', count: contributorCount }] : []),
			...(others.length > 0 ? [{ id: 'author', label: `More from ${owner}`, count: others.length }] : []),
		];
		const tabs = new Tabs({
			tabs: tabsFor({ shared: [], pictures }),
			panels,
			selected: 'readme',
			style: { marginTop: theme.space.lg, overflowY: 'hidden' },
		});
		const shown = {
			shared: [],
			pictures,
			byKey: new Map(listing.map(other => [collectionKey(other), other])),
			loading: true,
		};
		const showGallery = found => {
			Object.assign(shown, found);
			gallery.content(pictureGrid(title, shown.pictures));
			players.content(playerShotsOf(entry, title, shown, () => loadPlayerShots()));
			tabs.options.tabs = tabsFor(shown);
		};
		const loadPlayerShots = () => {
			showGallery({ loading: true, problem: undefined });
			loadShots()
				.then(byMod => !signal.aborted && showGallery({ shared: byMod[collectionKey(entry)] ?? [], loading: false }))
				.catch(error => !signal.aborted && showGallery({ problem: error.message, loading: false }));
		};

		loadPacks()
			.then(found => {
				if (signal.aborted) return;

				const using = found.filter(pack => pack.matched.includes(collectionKey(entry)));

				panels.packs.content([
					new Meta({ tag: 'p', textContent: `The packs that name ${title}, the most starred first.` }),
					...using.map(packCard),
				]);
				Object.assign(shown, { packs: using });
				tabs.options.tabs = tabsFor(shown);
			})
			.catch(() => {});
		loadPlayerShots();
		loadExplanations()
			.then(byMod => !signal.aborted && byMod[collectionKey(entry)] && downloads.explain(byMod[collectionKey(entry)]))
			.catch(() => {});

		const shares = entry.shares ?? sharing(entry, listing);
		const author = authorOf(entry, listing);

		document.title = `${title} :: ender index`;
		this.bar.trail({ label: title });
		collection.subscribe(redrawControls, signal);
		local.subscribe(redrawControls, signal);
		local.ready().then(served => {
			redrawControls();
			if (served) local.loadStars();
		});

		this.body.content([
			new Row({
				style: { flexWrap: 'nowrap', alignItems: 'flex-start', gap: theme.space.lg },
				append: [
					avatar(pictureUrl(entry, 192), 96),
					new Stack({
						style: { flex: '1', minWidth: '0', gap: theme.space.sm },
						append: [
							new Row({
								append: [
									new Link({
										href: repositoryUrl(entry),
										target: '_blank',
										textContent: `${entry.repo} on ${HOSTS[entry.host ?? 'github'] ?? 'GitHub'}`,
									}),
									new Link({
										href: authorPath(entry),
										textContent: `Every mod of ${owner}'s`,
										tooltip: `Search the index for ${owner}'s mods alone`,
									}),
									...(entry.forkOf ? [forkedFrom(entry)] : []),
									...(record.license ? [new Meta({ textContent: record.license })] : []),
									...(author ? [new Meta({ textContent: `by the author of ${author}` })] : []),
								],
							}),
							...about(aboutOf(entry)),
							new Row({
								append: [
									...loadersOf(entry).map(loader => new Chip({ textContent: loader })),
									...(entry.tags ?? []).map(
										tag =>
											new Link({
												href: tagPath(tag),
												tooltip: `Every mod the index gave the theme ${tag}`,
												append: new Chip({ textContent: tag }),
											}),
									),
								],
							}),
						],
					}),
				],
			}),
			...(entry.latest?.secrets?.length > 0
				? [
						new Alarm({
							append: [
								new Component({ tag: 'strong', textContent: secretsSentence(entry.latest.secrets) }),
								new Meta({
									tag: 'div',
									textContent: `Found in ${entry.latest.tag}; the Downloads tab shows the classes that name them.`,
								}),
								new Link({ href: findingsPath('secrets'), textContent: 'What this means, and what to do' }),
							],
						}),
					]
				: []),
			...(entry.latest?.gained?.length > 0
				? [
						new Warning({
							textContent: `Its newest release, ${entry.latest.tag}, found what the release before it did not: ${entry.latest.gained.map(findingLabel).join(', ')}`,
						}),
					]
				: []),
			...(shares ? [new Warning({ textContent: `It ${shares}: check you have the one you mean` })] : []),
			...(entry.replaced
				? [new Warning({ textContent: 'A jar in one of its releases was changed after publishing' })]
				: []),
			...(entry.fromSource
				? [
						new Warning({
							append: [
								`${BUILT_FROM_SOURCE} `,
								askControl(entry, 'release', { textContent: 'Ask its author for a release' }),
							],
						}),
					]
				: []),
			new Row({
				append: [new Command({ code: command, copyButton: true }), controls],
			}),
			forStrangers(
				new Meta({
					tag: 'p',
					append: [
						'The command installs it with ender, the launcher this index is made for, with what it needs. ',
						new Link({ href: LAUNCHER, textContent: 'Get ender' }),
					],
				}),
			),
			downloads.best,
			new Row({
				style: { marginTop: theme.space.md },
				append: [
					stat(count(record.stars ?? 0), 'stars'),
					...(entry.downloads === undefined ? [] : [stat(count(entry.downloads), 'downloads')]),
					...(entry.usedBy ? [stat(count(entry.usedBy), 'used by')] : []),
					stat(date(entry.latest?.published), 'latest release'),
					stat(date(record.created), 'created'),
					stat(date(record.pushed), 'last pushed'),
				],
			}),
			...(supportOf(entry).length > 0
				? [
						new SectionLabel({ level: 2, textContent: 'Support the author' }),
						new Row({
							append: supportOf(entry).map(
								({ url, label }) =>
									new Link({
										variant: 'raised',
										href: url,
										target: '_blank',
										attributes: { rel: 'noopener noreferrer' },
										textContent: label,
									}),
							),
						}),
						new Meta({
							tag: 'p',
							textContent:
								"From the author's FUNDING.yml, here or in their other repositories, its readme's links to their own pages, the links their mod gives in Mod Menu, and Modrinth.",
						}),
					]
				: [
						new Meta({
							tag: 'p',
							style: { marginTop: theme.space.xl },
							append: [
								'The index knows no way to support its author. ',
								...(funded.length > 0
									? [
											`${count(funded.length)} of its contributors ${funded.length === 1 ? 'takes' : 'take'} support: `,
											new Link({
												href: `${repositoryUrl(entry)}/graphs/contributors`,
												textContent: funded.length === 1 ? 'see who' : 'see who they are',
												onPointerPress: event => {
													event.preventDefault();
													tabs.options.selected = 'contributors';
													contributing.onlySupported();
													tabs.elem.scrollIntoView({ behavior: 'smooth' });
												},
											}),
											'. ',
										]
									: []),
								new Link({ href: authorsPath('funding'), textContent: 'Is it yours? Here is how to add one.' }),
							],
						}),
						new Row({
							append: [
								askControl(entry, 'fund', {
									variant: 'raised',
									textContent: 'I would pay its author',
									tooltip:
										'Counted once per player on GitHub, and shown here; when enough players have asked, the index reaches out to its author.',
								}),
							],
						}),
					]),
			...(entry.forkOf?.funding ? originalSupport(entry) : []),
			tabs,
			...Object.values(panels),
		]);

		const loadReadme = () =>
			fetchReadme(entry, record.readme, signal)
				.then(found => {
					if (signal.aborted) return;

					if (found === undefined) {
						readme.content(
							new EmptyState({
								icon: 'file-lines',
								title: 'No readme',
								message:
									record.readme === null
										? 'The repository has no readme.'
										: 'No readme was found at the root of the repository.',
							}),
						);

						return;
					}

					showGallery({
						pictures: [...new Set([...screenshotsOf(found.markdown, found.sources.raw, PICTURES_SHOWN), ...pictures])],
					});

					const prose = new Prose();

					prose.elem.innerHTML = renderReadme(found.markdown, found.sources);
					prose.elem.addEventListener(
						'click',
						event => {
							const anchor = event.target.closest(`a[href^="#${HEADING_PREFIX}"]`);

							if (!anchor) return;

							event.preventDefault();
							prose.elem
								.querySelector(`[id="${CSS.escape(anchor.getAttribute('href').slice(1))}"]`)
								?.scrollIntoView({ behavior: 'smooth' });
						},
						{ signal },
					);
					readme.content(prose);
				})
				.catch(error => {
					if (error.name === 'AbortError') return;

					readme.content(
						new EmptyState({
							icon: 'triangle-exclamation',
							title: 'The readme did not load',
							message: error.message,
							action: {
								textContent: 'Try again',
								onPointerPress: () => {
									readme.content(new EmptyState({ loading: true, title: 'Fetching the readme' }));
									loadReadme();
								},
							},
						}),
					);
				});

		loadReadme();
	}
}
