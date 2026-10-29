import {
	Button,
	Component,
	Content,
	EmptyState,
	Input,
	Link,
	Notify,
	Tabs,
	View,
	styled,
	theme,
} from '@vanilla-bean/components';

import { HOSTS } from 'ender-launcher/rank';
import { loadListing, loadPackPage, loadPacks } from './data';
import { local } from './local';
import { Prose, renderReadme } from './ModPage';
import { installRow, packCard, packChips, packFace, packWarnings } from './packs';
import {
	collectionKey,
	kindOf,
	similarPacks,
	readmeSources,
	repositoryUrl,
	writePackQuery,
} from './search';
import {
	Chip,
	LAUNCHER,
	Meta,
	Row,
	Stack,
	about,
	count,
	date,
	fetchReadme,
	forLocal,
	forStrangers,
	siteBar,
	stat,
	tiles,
} from './ui';

const Heading = styled.Component(
	() => `
		margin: 0;
		font-size: 1.6em;
		overflow-wrap: anywhere;
	`,
);

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
	({ colors }) => `
		display: inline-block;
		width: 0.7em;
		height: 0.7em;
		margin-right: 0.35em;
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

const JARS = { modrinth: 'jar from Modrinth', link: 'jar from its own link', none: 'no jar found' };

/** A mod the index has not got: its name, where its jar comes from, and its source and Modrinth page where it has them. */
const outsideMod = mod =>
	new Row({
		append: [
			new Chip({ textContent: mod.name }),
			new Meta({ append: [new Swatch({ tag: 'span', addClass: mod.jar }), JARS[mod.jar]] }),
			...(mod.source ? [new Link({ href: mod.source, target: '_blank', textContent: 'source' })] : []),
			...(mod.modrinth
				? [new Link({ href: `https://modrinth.com/mod/${mod.modrinth}`, target: '_blank', textContent: 'Modrinth' })]
				: []),
		],
	});

const group = (title, explained, content) =>
	new Stack({
		style: { gap: theme.space.sm, marginTop: theme.space.md },
		append: [
			new Heading({ tag: 'h2', style: { fontSize: '1.1em' }, textContent: title }),
			new Meta({ tag: 'p', textContent: explained }),
			...content,
		],
	});

/** Every mod the pack names, those matching what is typed alone, in the index first and then by where their jar is. */
const modsPanel = (pack, byKey) => {
	const filter = new Input({
		type: 'search',
		placeholder: `Filter its ${count(pack.count)} mods`,
		style: { maxWidth: '320px' },
	});
	const shown = new Stack();
	const draw = () => {
		const words = filter.elem.value.toLowerCase().split(/\s+/).filter(Boolean);
		const fits = text => words.every(word => text.toLowerCase().includes(word));
		const indexed = [...new Set(pack.mods.filter(mod => mod.key).map(mod => mod.key))]
			.map(key => byKey.get(key))
			.filter(entry => entry && fits(`${entry.title ?? ''} ${entry.repo} ${entry.description ?? ''}`));
		const outside = pack.mods.filter(mod => !mod.key && fits(`${mod.name} ${mod.file ?? ''}`));
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
							sourced.map(outsideMod),
						),
					]
				: []),
			...(noSource.length > 0
				? [
						group(
							`No source found (${count(noSource.length)})`,
							'Nothing they are published with links a source the index can read.',
							noSource.map(outsideMod),
						),
					]
				: []),
			...(indexed.length + outside.length === 0
				? [new Meta({ tag: 'p', textContent: 'None of its mods match.' })]
				: []),
		]);
	};

	filter.elem.addEventListener('input', draw);
	draw();

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
					location.hash = '#/instances';
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

		this.content([bar, new Content({ column: 900, style: { paddingBlock: '12px' }, append: body })]);

		Promise.all([loadPackPage(host, repo), loadListing().catch(() => [])])
			.then(([pack, listing]) => {
				if (this.signal.aborted) return;

				if (!pack) {
					body.content(
						new EmptyState({
							icon: 'magnifying-glass',
							title: `${repo} is not a pack the index lists`,
							action: { textContent: 'Every pack', onPointerPress: () => (location.hash = '#/packs') },
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
							new Heading({ tag: 'h1', textContent: pack.name }),
							new Row({
								append: [
									new Link({
										href: repositoryUrl(pack),
										target: '_blank',
										textContent:
											pack.host === 'gist' ? `a gist of ${owner}'s` : `${pack.repo} on ${HOSTS[pack.host] ?? 'GitHub'}`,
									}),
									new Link({
										href: `#/packs${writePackQuery({ query: owner })}`,
										textContent: `Every pack of ${owner}'s`,
									}),
									...(pack.version ? [new Meta({ textContent: `version ${pack.version}` })] : []),
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

		fetchReadme(entry, undefined, signal)
			.then(found => {
				if (signal.aborted) return;

				if (found === undefined) {
					readme.content(new Meta({ tag: 'p', textContent: 'No readme was found at the root of the repository.' }));

					return;
				}

				const prose = new Prose();

				prose.elem.innerHTML = renderReadme(found.markdown, found.sources ?? readmeSources(entry));
				readme.content(prose);
			})
			.catch(
				error =>
					!signal.aborted &&
					readme.content(new Meta({ tag: 'p', textContent: `The readme did not load: ${error.message}` })),
			);
	}
}
