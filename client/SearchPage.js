import {
	Button,
	Card,
	Content,
	EmptyState,
	Input,
	Link,
	Notify,
	Select,
	Tabs,
	Toolbar,
	debounce,
	theme,
} from '@vanilla-bean/components';
import { HOSTS, rank } from 'ender-launcher/rank';

import { collection } from './collection';
import { collectButton, installControls, instancePicker } from './controls';
import { loadListing, loadVersions } from './data';
import { local } from './local';
import {
	CAPABILITIES,
	INDEX,
	LOADERS,
	REPOSITORY,
	fittingVersions,
	installCommand,
	loadersOf,
	modPath,
	pictureUrl,
	readQuery,
	releaseUrl,
	releasesUrl,
	repositoryUrl,
	titleOf,
	writeQuery,
} from './search';
import { Chip, Command, Meta, Row, Stack, Title, View, Warning, avatar, copyCommand, count, paragraph } from './ui';

const PAGE_SIZE = 25;

const resultCard = ({ entry, sharing, unproven }, versions, { minecraft }) => {
	const host = entry.host ?? 'github';
	const title = titleOf(entry);
	const fitting = fittingVersions(entry, versions, { minecraft });
	const command = installCommand(entry);
	const capabilities = entry.latest?.capabilities ?? [];

	return new Card(
		{ accent: sharing || unproven || entry.replaced ? theme.colors.warning : undefined },
		new Row({
			style: { flexWrap: 'nowrap', alignItems: 'flex-start', gap: theme.space.md },
			append: [
				new Link({ href: `#${modPath(entry)}`, title: `Read about ${title}`, append: avatar(pictureUrl(entry)) }),
				new Stack({
					style: { flex: '1', minWidth: '0', gap: theme.space.sm },
					append: [
						new Row({
							append: [
								new Link({ href: `#${modPath(entry)}`, append: new Title({ textContent: title }) }),
								new Link({
									href: repositoryUrl(entry),
									target: '_blank',
									textContent: host === 'github' ? entry.repo : `${entry.repo} on ${HOSTS[host]}`,
								}),
								new Meta({ textContent: `${count(entry.stars ?? 0)} stars` }),
							],
						}),
						...(entry.description ? [paragraph(entry.description)] : []),
						new Row({
							append: [
								...loadersOf(entry).map(loader => new Chip({ textContent: loader })),
								...(fitting.versions.length > 0
									? [
											new Chip({
												textContent: `${fitting.versions.join(', ')}${fitting.more > 0 ? ` +${fitting.more}` : ''}`,
												title: 'The newest Minecraft releases its jars declare',
											}),
										]
									: []),
								...capabilities.map(
									capability =>
										new Chip({
											addClass: 'finding',
											textContent: `reaches ${capability}`,
											title: CAPABILITIES[capability],
										}),
								),
							],
						}),
						...(sharing ? [new Warning({ textContent: `It ${sharing}: check you have the one you mean` })] : []),
						...(unproven
							? [
									new Warning({
										textContent: `Few stars, and ${unproven}. Any jar can claim a mod's name: make sure this is the one you mean`,
									}),
								]
							: []),
						...(entry.replaced
							? [new Warning({ textContent: 'A jar in one of its releases was changed after publishing' })]
							: []),
						new Row({
							append: [
								new Command({ tag: 'code', textContent: command }),
								new Button({
									icon: 'copy',
									variant: 'flat',
									title: 'Copy',
									onPointerPress: () => copyCommand(command),
								}),
								collectButton(entry),
								...installControls(entry),
								minecraft
									? new Link({ href: releasesUrl(entry), target: '_blank', textContent: 'Releases' })
									: new Link({ href: releaseUrl(entry), target: '_blank', textContent: `Release ${entry.latest.tag}` }),
							],
						}),
					],
				}),
			],
		}),
	);
};

export default class SearchPage extends View {
	build() {
		const state = readQuery(location.search);
		let entries;
		let versions = [];
		let shown = PAGE_SIZE;
		let ranked = [];

		const results = new Stack({ append: new EmptyState({ loading: true, title: 'Loading the index' }) });
		const status = new Meta();
		const more = new Button({
			variant: 'flat',
			textContent: 'Show more',
			style: { display: 'none', alignSelf: 'center' },
			onPointerPress: () => showMore(),
		});

		const draw = () => {
			results.content(
				ranked.length > 0
					? ranked.slice(0, shown).map(found => resultCard(found, versions, state))
					: new EmptyState({
							icon: 'magnifying-glass',
							title: 'No mods match',
							message:
								'Every word has to appear in a mod id, name or description, and its jars have to fit the filters',
						}),
			);
			more.elem.style.display = ranked.length > shown ? '' : 'none';
		};

		const render = () => {
			if (entries === undefined) return;

			history.replaceState(null, '', `${location.pathname}${writeQuery(state)}${location.hash}`);

			ranked = rank(entries, state.query, state);
			status.content(
				`${count(ranked.length)} of ${count(entries.length)} indexed repositories${state.query.trim() ? '' : ', by stars'}`,
			);
			draw();
		};

		const showMore = () => {
			if (ranked.length <= shown) return;

			shown += PAGE_SIZE;
			draw();
		};

		const restart = () => {
			shown = PAGE_SIZE;
			render();
		};

		const search = new Input({
			type: 'search',
			value: state.query,
			placeholder: 'Search mods: lithium, fabric api, backpacks',
			style: { flex: '1', minWidth: '12em', width: 'auto' },
			onInput: debounce(({ target: { value } }) => {
				state.query = value;
				restart();
			}, 150),
		});

		const minecraft = new Select({
			options: [{ label: 'Any Minecraft', value: '' }, ...(state.minecraft ? [state.minecraft] : [])],
			value: state.minecraft ?? '',
			style: { width: 'auto' },
			onChange: ({ target: { value } }) => {
				state.minecraft = value || undefined;
				restart();
			},
		});

		const loader = new Tabs({
			variant: 'segmented',
			tabs: [{ id: 'any', label: 'Any' }, ...Object.entries(LOADERS).map(([id, label]) => ({ id, label }))],
			selected: state.loader ?? 'any',
			onChange: ({ value }) => {
				state.loader = value === 'any' ? undefined : value;
				restart();
			},
		});

		const versionList = loadVersions().catch(error => {
			new Notify({
				intent: 'warning',
				content: `Mojang's version list did not load (${error.message}), so results do not say which versions they fit`,
			});

			return [];
		});

		Promise.all([loadListing(), versionList])
			.then(([listing, released]) => {
				if (this.signal.aborted) return;

				entries = listing;
				versions = released;
				minecraft.options.options = [
					{ label: 'Any Minecraft', value: '' },
					...new Set([...(state.minecraft ? [state.minecraft] : []), ...released]),
				];
				minecraft.options.value = state.minecraft ?? '';
				render();
			})
			.catch(error => {
				if (this.signal.aborted) return;

				results.content(
					new EmptyState({
						icon: 'triangle-exclamation',
						title: 'The index did not load',
						message: `${INDEX}/search.json: ${error.message}`,
					}),
				);
			});

		collection.subscribe(() => draw(), this.signal);
		local.subscribe(() => draw(), this.signal);

		const localBar = new Row();

		local.ready().then(available => {
			if (!available || this.signal.aborted) return;

			localBar.content([new Meta({ textContent: 'Installing into' }), instancePicker()]);

			// Filters follow the instance, so what is offered is what it can load
			const chosen = local.instances.find(instance => instance.name === local.selected);

			if (chosen && !state.minecraft && !state.loader) {
				state.minecraft = chosen.minecraft;
				state.loader = chosen.loader?.type in LOADERS ? chosen.loader.type : undefined;
				minecraft.options.value = state.minecraft;
				loader.options.selected = state.loader ?? 'any';
				restart();
			}
		});

		const scrolling = new Content({
			column: 900,
			style: { paddingBlock: '12px' },
			append: [
				new Meta({
					tag: 'p',
					textContent:
						'Minecraft mods found where their source lives. Every jar here came from the releases of its own repository and was scanned by ender: what its code can reach is a finding, not a verdict.',
				}),
				new Toolbar({ style: { margin: '12px 0 4px' }, append: [search, minecraft, loader] }),
				localBar,
				status,
				new Stack({ style: { marginTop: '12px' }, append: [results, more] }),
			],
		});

		// The next page loads as the reader nears the end, a screen ahead, so the button is only met when nothing does
		const nearTheEnd = new IntersectionObserver(([seen]) => seen.isIntersecting && showMore(), {
			root: scrolling.elem,
			rootMargin: '0px 0px 100% 0px',
		});

		nearTheEnd.observe(more.elem);
		this.signal.addEventListener('abort', () => nearTheEnd.disconnect());

		this.content([
			new Toolbar({
				variant: 'bar',
				heading: 'ender index',
				append: [new Link({ variant: 'flat', href: REPOSITORY, target: '_blank', textContent: 'Source' })],
			}),
			scrolling,
		]);

		search.elem.focus();
	}
}
