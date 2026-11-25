import {
	Button,
	Card,
	Component,
	Content,
	EmptyState,
	Input,
	Link,
	Notify,
	SectionLabel,
	Tabs,
	View,
	styled,
	theme,
} from '@vanilla-bean/components';

import { HOSTS } from 'ender-launcher/rank';
import { loadListing, loadPackPage, loadPacks } from './data';
import { modrinthProjects } from './modrinthProjects';
import { local } from './local';
import { Prose, renderReadme } from './ModPage';
import { installRow, packCard, packChips, packFace, packWarnings } from './packs';
import { readMoreOf } from './instanceMods';
import {
	aboutOf,
	collectionKey,
	kindOf,
	pictureUrl,
	similarPacks,
	readmeSources,
	repositoryUrl,
	titleOf,
	writePackQuery,
} from './search';
import {
	Chip,
	LAUNCHER,
	Meta,
	Row,
	Stack,
	Title,
	about,
	avatar,
	count,
	date,
	fetchReadme,
	forLocal,
	forStrangers,
	siteBar,
	stat,
	tiles,
	siteFooter,
} from './ui';
import { ROUTES, hrefOf, navigate } from './route';

/** Where a pack's mods come from, each kind a share of one bar, told again beneath it in words. */
const KINDS = [
	{ id: 'indexed', label: 'in the index', color: 'success' },
	{ id: 'link', label: 'from their own link', color: 'accent' },
	{ id: 'modrinth', label: 'from Modrinth', color: 'warning' },
	{ id: 'none', label: 'no jar found', color: 'danger' },
];

const Bar = styled.Component(
	({ colors, radius }) => `
		display: flex;
		height: 10px;
		overflow: hidden;
		border-radius: ${radius.md};
		background: ${colors.raised};

		& > span {
			display: block;
			height: 100%;
		}

		${KINDS.map(kind => `& > .${kind.id} { background: ${colors[kind.color]}; }`).join('\n')}
	`,
);

const Swatch = styled.Component(
	({ colors, space }) => `
		display: inline-block;
		width: 0.7em;
		height: 0.7em;
		margin-right: ${space.xs};
		border-radius: 2px;

		${KINDS.map(kind => `&.${kind.id} { background: ${colors[kind.color]}; }`).join('\n')}
	`,
);

const coverage = mods => {
	const counted = KINDS.map(kind => ({ ...kind, count: mods.filter(mod => kindOf(mod) === kind.id).length })).filter(
		kind => kind.count > 0,
	);

	return new Stack({
		style: { gap: theme.space.xs, marginTop: theme.space.md },
		append: [
			new Bar({
				attributes: { role: 'img', 'aria-label': counted.map(kind => `${kind.count} ${kind.label}`).join(', ') },
				append: counted.map(
					kind =>
						new Component({
							tag: 'span',
							addClass: kind.id,
							title: `${count(kind.count)} ${kind.label}`,
							style: { width: `${(kind.count / mods.length) * 100}%` },
						}),
				),
			}),
			new Row({
				style: { gap: theme.space.md },
				append: counted.map(
					kind =>
						new Meta({
							append: [new Swatch({ tag: 'span', addClass: kind.id }), `${count(kind.count)} ${kind.label}`],
						}),
				),
			}),
		],
	});
};

const JARS = {
	indexed: 'in the index',
	modrinth: 'jar from Modrinth',
	link: 'jar from its own link',
	none: 'no jar found',
};

/** JARS, for a resource or shader pack, which is a zip rather than a jar. */
const FILES = { modrinth: 'from Modrinth', link: 'from its own link', none: 'no file found' };

const KIND_WORDS = { resourcepacks: 'resource pack', shaderpacks: 'shader pack' };

const away = { target: '_blank', attributes: { rel: 'noopener noreferrer' } };

/** The project a pack names something by, as readMoreOf takes it. */
const publishedAs = mod => {
	if (mod.modrinth) return { source: 'modrinth', id: mod.modrinth };
	if (mod.curseforge) return { source: 'curseforge', id: mod.curseforge };

	return {};
};

/**
 * Something a pack installs, in a few lines as an instance's card shows it: its picture, name and what it is about,
 * from the index where the index has it and else from Modrinth (modrinthProjects.js), with the pack's own words for an
 * optional one; whether it is a resource or shader pack and whether it is optional; where its jar comes from; and where
 * to read more and its source.
 */
export const entryCard = (mod, { project, indexed } = {}) => {
	const kind = indexed ? 'indexed' : mod.jar;
	const readMore = readMoreOf(publishedAs(mod), indexed, mod.kind);
	const about = mod.description ?? (indexed ? aboutOf(indexed)?.text : project?.description);
	const facts = [
		KIND_WORDS[mod.kind],
		mod.optional && (mod.default ? 'optional, on unless turned off' : 'optional, off unless turned on'),
		(mod.kind ? FILES : JARS)[kind],
	]
		.filter(Boolean)
		.join(' · ');

	return new Card(
		{},
		new Row({
			style: { flexWrap: 'nowrap', alignItems: 'flex-start', gap: theme.space.md },
			append: [
				avatar(indexed ? pictureUrl(indexed, 80) : project?.icon, 40),
				new Stack({
					style: { flex: '1', minWidth: '0', gap: theme.space.xs },
					append: [
						new Title({ textContent: indexed ? titleOf(indexed) : (project?.title ?? mod.name) }),
						...(about ? [new Meta({ textContent: about })] : []),
						new Meta({ append: [...(kind ? [new Swatch({ tag: 'span', addClass: kind })] : []), facts] }),
						new Row({
							style: { columnGap: theme.space.md, rowGap: theme.space.xs },
							append: [
								...(readMore
									? [new Link({ href: readMore.href, textContent: readMore.label, ...(readMore.away ? away : {}) })]
									: []),
								...(mod.source ? [new Link({ href: mod.source, textContent: 'Its source', ...away })] : []),
							],
						}),
					],
				}),
			],
		}),
	);
};

const group = (title, explained, content) =>
	new Stack({
		style: { gap: theme.space.sm, marginTop: theme.space.md },
		append: [
			new SectionLabel({ level: 2, textContent: title }),
			new Meta({ tag: 'p', textContent: explained }),
			...content,
		],
	});

/** The Modrinth projects a pack names among what it installs and the index has not got. */
const modrinthNamed = entries => entries.filter(entry => !entry.key && entry.modrinth).map(entry => entry.modrinth);

/**
 * What a pack carries beside the mods every player gets: the mods it offers as a choice, its resource and shader
 * packs, each as entryCard draws it from `byKey` (the index's listing) and `published` (what Modrinth says), and the
 * servers it adds to the multiplayer list. Nothing for a pack with none of them.
 */
export const packExtras = (pack, byKey = new Map(), published = new Map()) => {
	const optional = pack.mods.filter(mod => mod.optional);
	const extras = pack.extras ?? [];
	const servers = pack.servers ?? [];
	const card = mod =>
		entryCard(mod, {
			indexed: mod.key ? byKey.get(mod.key) : undefined,
			project: mod.modrinth ? published.get(mod.modrinth) : undefined,
		});

	return [
		...(optional.length > 0
			? [
					group(
						`Optional mods (${count(optional.length)})`,
						'Each player chooses these: ender optional turns one on or off, and ender web has a switch for each.',
						optional.map(card),
					),
				]
			: []),
		...(extras.length > 0
			? [
					group(
						`Resource and shader packs (${count(extras.length)})`,
						'Installed beside its mods into their own folders, and turned on when they are new to an instance.',
						extras.map(card),
					),
				]
			: []),
		...(servers.length > 0
			? [
					group(
						`Servers (${count(servers.length)})`,
						"Added to the game's multiplayer list after a player's own, and taken off when the pack drops them.",
						servers.map(
							server =>
								new Row({
									append: [new Chip({ textContent: server.name }), new Meta({ textContent: server.address })],
								}),
						),
					),
				]
			: []),
	];
};

/** packExtras, drawn again once Modrinth has said what the pack's choices and resource and shader packs are. */
const extrasPanel = (pack, byKey, signal) => {
	const panel = new Stack({ append: packExtras(pack, byKey) });

	modrinthProjects(modrinthNamed([...pack.mods.filter(mod => mod.optional), ...(pack.extras ?? [])]))
		.then(published => {
			if (!signal.aborted && published.size > 0) panel.content(packExtras(pack, byKey, published));
		})
		.catch(() => {});

	return panel;
};

/** What a pack pins and asks for, beside its version: who made it, its loader's exact version, and its memory. */
export const packByline = pack => [
	...(pack.version ? [new Meta({ textContent: `version ${pack.version}` })] : []),
	...(pack.author ? [new Meta({ textContent: `by ${pack.author}` })] : []),
	...(pack.loaderVersion ? [new Meta({ textContent: `${pack.loader} ${pack.loaderVersion}, pinned` })] : []),
	...(pack.memory ? [new Meta({ textContent: `asks for ${Math.round(pack.memory / 1024)} GB of memory` })] : []),
];

/** Every mod the pack names, those matching what is typed alone, in the index first and then by where their jar is. */
const modsPanel = (pack, byKey) => {
	const filter = new Input({
		type: 'search',
		placeholder: `Filter its ${count(pack.count)} mods`,
		attributes: { 'aria-label': 'Filter its mods' },
		style: { maxWidth: '320px' },
	});
	const shown = new Stack();
	// What Modrinth says of the mods the index has not got, once it answers
	let published = new Map();
	const draw = () => {
		const words = String(filter.options.value).toLowerCase().split(/\s+/).filter(Boolean);
		const fits = text => words.every(word => text.toLowerCase().includes(word));
		const projectOf = mod => (mod.modrinth ? published.get(mod.modrinth) : undefined);
		const indexed = [...new Set(pack.mods.filter(mod => mod.key).map(mod => mod.key))]
			.map(key => byKey.get(key))
			.filter(entry => entry && fits(`${entry.title ?? ''} ${entry.repo} ${entry.description ?? ''}`));
		const outside = pack.mods.filter(
			mod =>
				!mod.key &&
				fits(`${mod.name} ${mod.file ?? ''} ${projectOf(mod)?.title ?? ''} ${projectOf(mod)?.description ?? ''}`),
		);
		const sourced = outside.filter(mod => mod.source);
		const noSource = outside.filter(mod => !mod.source);

		shown.content([
			...(indexed.length > 0
				? [
						group(
							`In the index (${count(indexed.length)})`,
							'Read from their source and its releases, as every mod in the index is.',
							[tiles(indexed, indexed.length)],
						),
					]
				: []),
			...(sourced.length > 0
				? [
						group(
							`Source known, not in the index (${count(sourced.length)})`,
							'Their source is linked, but the index has no jar of theirs from it: their authors put their jars on Modrinth or elsewhere, or the crawl has not read them yet.',
							sourced.map(mod => entryCard(mod, { project: projectOf(mod) })),
						),
					]
				: []),
			...(noSource.length > 0
				? [
						group(
							`No source found (${count(noSource.length)})`,
							'Nothing they are published with links a source the index can read.',
							noSource.map(mod => entryCard(mod, { project: projectOf(mod) })),
						),
					]
				: []),
			...(indexed.length + outside.length === 0
				? [
						new EmptyState({
							icon: 'magnifying-glass',
							title: 'None of its mods match',
							message: `No mod of the pack has every word of "${words.join(' ')}" in its name or description`,
						}),
					]
				: []),
		]);
	};

	filter.elem.addEventListener('input', draw);
	draw();
	modrinthProjects(modrinthNamed(pack.mods))
		.then(found => {
			published = found;
			if (found.size > 0) draw();
		})
		.catch(() => {});

	return new Stack({ append: [filter, shown] });
};

const importButton = pack =>
	forLocal(
		new Button({
			icon: 'download',
			textContent: 'Import as an instance',
			onPointerPress: async () => {
				try {
					await local.importPack(pack.install.replace(/^ender import /, ''));
					new Notify({ intent: 'success', content: `Importing ${pack.name}; it is followed on Instances` });
					navigate(ROUTES.instances);
				} catch (error) {
					new Notify({ intent: 'danger', content: `ender could not import ${pack.name}: ${error.message}` });
				}
			},
		}),
	);

export default class PackPage extends View {
	build() {
		const { host, owner, name } = this.options;
		const repo = `${owner}/${name}`;
		const body = new Stack({ append: new EmptyState({ loading: true, title: `Loading ${repo}` }) });
		const bar = siteBar('packs', { label: repo });

		this.content([
			bar,
			new Content({ column: 900, style: { paddingBlock: theme.space.md }, append: [body, siteFooter()] }),
		]);

		Promise.all([loadPackPage(host, repo), loadListing().catch(() => [])])
			.then(([pack, listing]) => {
				if (this.signal.aborted) return;

				if (!pack) {
					body.content(
						new EmptyState({
							icon: 'magnifying-glass',
							title: `${repo} is not a pack the index lists`,
							action: new Link({ variant: 'button', href: hrefOf(ROUTES.packs), textContent: 'Every pack' }),
						}),
					);

					return;
				}

				document.title = `${pack.name} :: ender index`;
				bar.trail({ label: pack.name });
				this.show(pack, new Map(listing.map(entry => [collectionKey(entry), entry])));
			})
			.catch(error =>
				body.content(
					new EmptyState({
						icon: 'triangle-exclamation',
						title: `${repo} did not load`,
						message: error.message,
						action: { textContent: 'Try again', onPointerPress: () => this.render() },
					}),
				),
			);

		this.body = body;
	}

	show(pack, byKey) {
		const { signal } = this;
		const owner = pack.repo.split('/')[0];
		const readme = new Stack({ append: new EmptyState({ loading: true, title: 'Fetching the readme' }) });
		const similar = new Stack();
		const hasReadme = pack.host === 'github';
		const panels = {
			mods: modsPanel(pack, byKey),
			...(hasReadme ? { readme } : {}),
			similar,
		};
		const tabsFor = (alike = []) => [
			{ id: 'mods', label: 'Mods', count: pack.count },
			...(hasReadme ? [{ id: 'readme', label: 'Readme' }] : []),
			...(alike.length > 0 ? [{ id: 'similar', label: 'Similar packs', count: alike.length }] : []),
		];
		const tabs = new Tabs({
			tabs: tabsFor(),
			panels,
			selected: 'mods',
			style: { marginTop: theme.space.lg, overflowY: 'hidden' },
		});

		this.body.content([
			new Row({
				style: { flexWrap: 'nowrap', alignItems: 'flex-start', gap: theme.space.lg },
				append: [
					packFace(pack, 96),
					new Stack({
						style: { flex: '1', minWidth: '0', gap: theme.space.sm },
						append: [
							new Row({
								append: [
									new Link({
										href: repositoryUrl(pack),
										target: '_blank',
										textContent:
											pack.host === 'gist' ? `a gist of ${owner}'s` : `${pack.repo} on ${HOSTS[pack.host] ?? 'GitHub'}`,
									}),
									new Link({
										href: `${hrefOf(ROUTES.packs)}${writePackQuery({ query: owner })}`,
										textContent: `Every pack of ${owner}'s`,
									}),
									...packByline(pack),
								],
							}),
							...about(pack.description ? { text: pack.description } : undefined),
							new Row({ append: packChips(pack) }),
						],
					}),
				],
			}),
			...packWarnings(pack),
			installRow(pack, importButton(pack)),
			forStrangers(
				new Meta({
					tag: 'p',
					append: [
						'The command makes an instance of it with ender, the launcher this index is made for, every mod installed. ',
						new Link({ href: LAUNCHER, textContent: 'Get ender' }),
					],
				}),
			),
			new Row({
				style: { marginTop: theme.space.md },
				append: [
					stat(count(pack.count), 'mods'),
					stat(count(pack.matched.length), 'in the index'),
					...(pack.stars === undefined ? [] : [stat(count(pack.stars), 'stars')]),
					...(pack.pushed ? [stat(date(pack.pushed), 'last pushed')] : []),
				],
			}),
			coverage(pack.mods),
			extrasPanel(pack, byKey, signal),
			tabs,
			...Object.values(panels),
		]);

		loadPacks()
			.then(packs => {
				if (signal.aborted) return;

				const alike = similarPacks(pack, packs);

				similar.content([
					new Meta({ tag: 'p', textContent: 'The packs sharing the most of its mods the index has.' }),
					...alike.map(
						({ other, shared }) =>
							new Stack({
								style: { gap: theme.space.xs },
								append: [new Meta({ textContent: `shares ${count(shared)} mods` }), packCard(other)],
							}),
					),
				]);
				tabs.options.tabs = tabsFor(alike);
			})
			.catch(() => {});

		if (!hasReadme) return;

		const entry = { host: pack.host, repo: pack.repo };

		const loadReadme = () =>
			fetchReadme(entry, undefined, signal)
				.then(found => {
					if (signal.aborted) return;

					if (found === undefined) {
						readme.content(
							new EmptyState({
								icon: 'file-lines',
								title: 'No readme',
								message: 'No readme was found at the root of the repository.',
							}),
						);

						return;
					}

					const prose = new Prose();

					prose.elem.innerHTML = renderReadme(found.markdown, found.sources ?? readmeSources(entry));
					readme.content(prose);
				})
				.catch(error => {
					if (signal.aborted) return;

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
