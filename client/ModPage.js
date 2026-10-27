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
import { HOSTS, authorOf, sharing } from 'ender-launcher/rank';
import { ownerName } from 'ender-launcher/support';

import { collection } from './collection';
import { loadListing, loadVersions } from './data';
import {
	CAPABILITIES,
	LOADERS,
	aboutOf,
	authorPath,
	lineUrl,
	rangeLabel,
	readmeSources,
	screenshotsOf,
	tagPath,
	supportOf,
	fileSize,
	installCommand,
	loadersOf,
	pictureUrl,
	readQuery,
	readmeUrl,
	recordUrl,
	releaseUrl,
	repositoryUrl,
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
import { collectButton, installControls } from './controls';
import { local } from './local';
import {
	Chip,
	Command,
	Meta,
	Row,
	Stack,
	Warning,
	about,
	avatar,
	copyCommand,
	count,
	date,
	fetchReadme,
	LAUNCHER,
	breadcrumbs,
	forStrangers,
	siteBar,
	hint,
	loadJson,
	TILES,
	tiles,
} from './ui';

const Heading = styled.Component(
	() => `
		margin: 0;
		font-size: 1.6em;
		overflow-wrap: anywhere;
	`,
);

const Stat = styled.Component(
	({ colors, radius, space }) => `
		display: flex;
		flex-direction: column;
		padding: ${space.sm} ${space.md};
		border: 1px solid ${colors.border};
		border-radius: ${radius.md};
		min-width: 7em;

		& > strong {
			font-size: 1.2em;
		}
	`,
);

/** A readme as its host would show it, kept to this column: wide images and tables scale or scroll, never the page. */
const Prose = styled.Component(
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

const stat = (value, label) => new Stat({ append: [new Component({ tag: 'strong', textContent: value }), label] });

const slug = text =>
	text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');

const HEADING_PREFIX = 'readme-';

/**
 * A readme as safe markup: it is anyone's HTML, so it is sanitized before it is shown, links leave in a new tab, and
 * every relative image and link is pointed back at its repository.
 */
const renderReadme = (markdown, sources) => {
	const renderer = new marked.Renderer();

	renderer.heading = function ({ tokens, depth }) {
		const text = this.parser.parseInline(tokens);

		return `<h${depth} id="${HEADING_PREFIX}${slug(text.replace(/<[^>]+>/g, ''))}">${text}</h${depth}>`;
	};

	const purify = DOMPurify();

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

	return purify.sanitize(marked.parse(markdown, { renderer, gfm: true }), { ADD_ATTR: ['target'] });
};

const capabilityList = scan =>
	Object.entries(scan?.capabilities ?? {}).map(([capability, classes]) => {
		const details = new Component({ tag: 'details' });

		details.append(
			new Component({
				tag: 'summary',
				append: [
					new Chip({ addClass: 'finding', textContent: `reaches ${capability}` }),
					` ${CAPABILITIES[capability] ?? ''}`,
				],
			}),
			...Object.entries(classes).map(
				([className, calls]) =>
					new Meta({ tag: 'div', style: { marginLeft: '1em' }, textContent: `${className}: ${calls.join(', ')}` }),
			),
		);

		return details;
	});

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
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
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

/** Every picture of the mod its readme shows and its repository keeps, each opening at full size. */
const pictureGrid = (title, shots) => {
	const grid = new Pictures({
		append: shots.map(url => {
			const link = new Link({
				href: url,
				target: '_blank',
				attributes: { rel: 'noopener noreferrer' },
				tooltip: 'Open the full picture',
				append: new Component({
					tag: 'img',
					attributes: { src: url, alt: `A picture of ${title}`, loading: 'lazy', referrerpolicy: 'no-referrer' },
				}),
			});

			link.elem.querySelector('img').addEventListener('error', () => link.elem.remove());

			return link;
		}),
	});

	return [grid];
};

const fitsLabel = ({ minecraft, loader }) =>
	[minecraft && `Minecraft ${minecraft}`, loader && LOADERS[loader]].filter(Boolean).join(' with ') || 'any version';

/** What a jar's code reaches, folded: a finding to look into, not something every reader needs open. */
const findings = scan => {
	const reached = Object.keys(scan?.capabilities ?? {});
	const hosts = Object.keys(scan?.hosts ?? {});

	if (reached.length === 0 && hosts.length === 0) return [];

	const details = new Component({ tag: 'details' });

	details.append(
		new Component({
			tag: 'summary',
			append: new Meta({
				tag: 'span',
				textContent: [
					reached.length > 0 && `Its code reaches ${reached.join(', ')}`,
					hosts.length > 0 && `names ${hosts.length === 1 ? 'a host' : `${hosts.length} hosts`}`,
				]
					.filter(Boolean)
					.join('; '),
			}),
		}),
		...capabilityList(scan),
		...(hosts.length > 0 ? [new Meta({ tag: 'div', textContent: `Names hosts: ${hosts.join(', ')}` })] : []),
	);

	return [details];
};

const downloadRow = ({ asset }) => {
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
						range => new Chip({ textContent: `Minecraft ${rangeLabel(range)}`, tooltip: hint(`Declared as ${range}`) }),
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
			...findings(asset.scan),
		],
	});
};

const RELEASES_SHOWN = 3;

/** A release's notes, folded under its jars: rendered as its readme is, its links leading back to its repository. */
const releaseNotes = (release, sources) => {
	if (!release.notes) return [];

	const details = new Component({ tag: 'details' });
	const prose = new Prose();

	prose.elem.innerHTML = renderReadme(release.notes, sources);
	details.append(
		new Component({ tag: 'summary', append: new Meta({ tag: 'span', textContent: 'Release notes' }) }),
		prose,
	);

	return [details];
};

/** The jars that match, under the release each came in, newest first; past the first few, folded until asked for. */
const downloadList = (entry, matching, sources) => {
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
						...matching.filter(download => download.release === release).map(downloadRow),
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
				? downloadList(entry, matching, sources)
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
		onChange: ({ target: { value } }) => {
			choice.loader = value || undefined;
			draw();
		},
	});
	const text = new Input({
		type: 'search',
		placeholder: 'Filter by release, file or version',
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
		panel: [new Row({ append: [minecraft, loader, text] }), shown, list],
	};
};

export default class ModPage extends View {
	static schema = { host: {}, owner: {}, name: {} };

	build() {
		const repo = `${this.options.owner}/${this.options.name}`;
		const host = this.options.host;
		const body = new Stack({ append: new EmptyState({ loading: true, title: `Loading ${repo}` }) });

		this.crumbs = new Stack({ append: breadcrumbs({ label: 'Mods', href: `${location.search}#/` }, { label: repo }) });
		this.content([
			siteBar('mods'),
			new Content({ column: 900, style: { paddingBlock: '12px' }, append: [this.crumbs, body] }),
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
		const controls = new Row({ append: [collectButton(entry), ...installControls(entry)] });
		const redrawControls = () => controls.content([collectButton(entry), ...installControls(entry)]);
		const downloads = downloadsPanel(entry, record);
		const others = sameAuthor(entry, listing);
		const related = relatedGroups(entry, listing);
		const owner = ownerName(entry);
		const sources = readmeSources(entry, record.readme);
		const pictures = (record.pictures ?? []).map(path => sources.raw(path, { root: true }));
		const panels = {
			readme,
			gallery,
			downloads: new Stack({
				append: [
					new Meta({
						tag: 'p',
						textContent:
							'The newest releases with jars, each jar downloaded and read by the crawl. What its code can reach is a finding, not a verdict: an update checker reaches the network.',
					}),
					...downloads.panel,
				],
			}),
			related: new Stack({ append: related }),
			author: new Stack({
				append: [
					tiles(others, others.length),
					new Link({ href: authorPath(entry), textContent: `Every mod of ${owner}'s, in the search` }),
				],
			}),
		};
		const tabsFor = shots => [
			{ id: 'readme', label: 'Readme' },
			...(shots.length > 0 ? [{ id: 'gallery', label: 'Gallery', count: shots.length }] : []),
			{ id: 'downloads', label: 'Downloads', count: downloads.count },
			...(related.length > 0 ? [{ id: 'related', label: 'Related' }] : []),
			...(others.length > 0 ? [{ id: 'author', label: `More from ${owner}`, count: others.length }] : []),
		];
		const tabs = new Tabs({
			tabs: tabsFor(pictures),
			panels,
			selected: 'readme',
			style: { marginTop: theme.space.lg, overflowY: 'hidden' },
		});
		const showGallery = shots => {
			gallery.content(pictureGrid(title, shots));
			tabs.options.tabs = tabsFor(shots);
		};

		showGallery(pictures);

		const shares = entry.shares ?? sharing(entry, listing);
		const author = authorOf(entry, listing);

		document.title = `${title} :: ender index`;
		this.crumbs.content(breadcrumbs({ label: 'Mods', href: `${location.search}#/` }, { label: title }));
		collection.subscribe(redrawControls, signal);
		local.subscribe(redrawControls, signal);
		local.ready().then(redrawControls);

		this.body.content([
			new Row({
				style: { flexWrap: 'nowrap', alignItems: 'flex-start', gap: theme.space.lg },
				append: [
					avatar(pictureUrl(entry, 192), 96),
					new Stack({
						style: { flex: '1', minWidth: '0', gap: theme.space.sm },
						append: [
							new Heading({ tag: 'h1', textContent: title }),
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
			...(shares ? [new Warning({ textContent: `It ${shares}: check you have the one you mean` })] : []),
			...(entry.replaced
				? [new Warning({ textContent: 'A jar in one of its releases was changed after publishing' })]
				: []),
			new Row({
				append: [
					new Command({ tag: 'code', textContent: command }),
					new Button({ icon: 'copy', variant: 'flat', title: 'Copy', onPointerPress: () => copyCommand(command) }),
					controls,
				],
			}),
			forStrangers(
				new Meta({
					tag: 'p',
					append: [
						'The command installs it with ender, the launcher this index is made for, with what it needs. ',
						new Link({ href: LAUNCHER, target: '_blank', textContent: 'Get ender' }),
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
						new SectionLabel({ level: 2, textContent: 'Support the author', style: { marginTop: theme.space.xl } }),
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
							textContent: "From the author's own FUNDING.yml and the links their mod gives in Mod Menu.",
						}),
					]
				: []),
			tabs,
			...Object.values(panels),
		]);

		fetchReadme(entry, record.readme, signal)
			.then(found => {
				if (signal.aborted) return;

				if (found === undefined) {
					readme.content(
						new Meta({
							tag: 'p',
							textContent:
								record.readme === null
									? 'The repository has no readme.'
									: 'No readme was found at the root of the repository.',
						}),
					);

					return;
				}

				showGallery([...new Set([...screenshotsOf(found.markdown, found.sources.raw, PICTURES_SHOWN), ...pictures])]);

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
				if (error.name !== 'AbortError')
					readme.content(new Meta({ tag: 'p', textContent: `The readme did not load: ${error.message}` }));
			});
	}
}
