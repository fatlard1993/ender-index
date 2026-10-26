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
	View,
	debounce,
	styled,
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
	RELEASED,
	REPOSITORY,
	SIDES,
	SORTS,
	fittingVersions,
	installCommand,
	loadersOf,
	modPath,
	pictureUrl,
	readQuery,
	refine,
	releaseUrl,
	releasesUrl,
	repositoryUrl,
	titleOf,
	writeQuery,
} from './search';
import { Chip, Command, Meta, Row, Stack, Title, Warning, avatar, copyCommand, count, paragraph } from './ui';

const PAGE_SIZE = 25;

/** The filters past the first row: always shown on a wide screen, folded on a phone until asked for. */
const MoreFilters = styled.Component(
	({ media, space }) => `
		display: flex;
		flex-direction: column;
		gap: ${space.xs};

		@media ${media.phone} {
			&.folded {
				display: none;
			}
		}
	`,
);

const PhoneOnly = styled(
	Button,
	({ media }) => `
		flex: none;

		@media ${media.wide} {
			&.vbc-button {
				display: none;
			}
		}
	`,
);

const filtersLabel = ({ side, released, host, sort, avoid }) => {
	const active = [side, released, host, sort !== 'best', avoid.length > 0].filter(Boolean).length;

	return active > 0 ? `Filters (${active})` : 'Filters';
};

// Typing anywhere searches, except into a field, whose keys are its own
const isTypingInField = target =>
	target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);

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
				new Link({ href: `#${modPath(entry)}`, tooltip: `Read about ${title}`, append: avatar(pictureUrl(entry)) }),
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
								new Meta({
									textContent: [
										`${count(entry.stars ?? 0)} stars`,
										entry.downloads === undefined ? '' : `${count(entry.downloads)} downloads`,
										entry.usedBy ? `used by ${count(entry.usedBy)}` : '',
									]
										.filter(Boolean)
										.join(' · '),
									title:
										'Downloads are those its host counts for the releases the index read; used by counts the indexed mods that require it',
								}),
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

			ranked = refine(rank(entries, state.query, state), state);

			const bestOrder = state.query.trim() ? 'best match first' : 'by stars';
			const order = state.sort === 'best' ? bestOrder : SORTS[state.sort].toLowerCase();

			status.content(`${count(ranked.length)} of ${count(entries.length)} indexed repositories, ${order}`);
			draw();
		};

		const showMore = () => {
			if (ranked.length <= shown) return;

			shown += PAGE_SIZE;
			draw();
		};

		const restart = () => {
			shown = PAGE_SIZE;
			labelFolding();
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
			style: { maxWidth: '100%', overflowX: 'auto' },
			tabs: [{ id: 'any', label: 'Any' }, ...Object.entries(LOADERS).map(([id, label]) => ({ id, label }))],
			selected: state.loader ?? 'any',
			onChange: ({ value }) => {
				state.loader = value === 'any' ? undefined : value;
				restart();
			},
		});

		const choice = (key, choices, any) =>
			new Select({
				options: [{ label: any, value: '' }, ...Object.entries(choices).map(([value, label]) => ({ label, value }))],
				value: state[key] ?? '',
				style: { width: 'auto' },
				onChange: ({ target: { value } }) => {
					state[key] = value || undefined;
					restart();
				},
			});

		const sort = new Select({
			options: Object.entries(SORTS).map(([value, label]) => ({ label, value })),
			value: state.sort,
			style: { width: 'auto' },
			onChange: ({ target: { value } }) => {
				state.sort = value;
				restart();
			},
		});

		const avoiding = new Row({
			append: [
				new Meta({ textContent: 'Hide what reaches' }),
				...Object.keys(CAPABILITIES).map(capability => {
					const chip = new Button({
						variant: 'chip',
						textContent: capability,
						tooltip: CAPABILITIES[capability],
						onPointerPress: () => {
							state.avoid = state.avoid.includes(capability)
								? state.avoid.filter(avoided => avoided !== capability)
								: [...state.avoid, capability];
							chip.elem.classList.toggle('selected', state.avoid.includes(capability));
							restart();
						},
					});

					chip.elem.classList.toggle('selected', state.avoid.includes(capability));

					return chip;
				}),
			],
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
						action: { textContent: 'Try again', onPointerPress: () => this.render() },
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

		const moreFilters = new MoreFilters({
			addClass: 'folded',
			append: [
				new Toolbar({
					gap: 8,
					style: { margin: '4px 0' },
					append: [
						choice('side', SIDES, 'Any side'),
						choice('released', RELEASED, 'Released any time'),
						choice('host', HOSTS, 'Any host'),
						sort,
					],
				}),
				avoiding,
			],
		});

		const foldButton = new PhoneOnly({
			variant: 'flat',
			icon: 'sliders',
			textContent: filtersLabel(state),
			onPointerPress: () => moreFilters.toggleClass('folded'),
		});

		const labelFolding = () => (foldButton.options.textContent = filtersLabel(state));

		const scrolling = new Content({
			column: 900,
			style: { paddingBlock: '12px' },
			append: [
				new Meta({
					tag: 'p',
					textContent:
						'Minecraft mods found where their source lives. Every jar here came from the releases of its own repository and was scanned by ender: what its code can reach is a finding, not a verdict.',
				}),
				new Toolbar({ style: { margin: '12px 0 4px' }, append: [search, minecraft, loader, foldButton] }),
				moreFilters,
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

		document.addEventListener(
			'keydown',
			event => {
				if (isTypingInField(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

				if (event.key === '/') event.preventDefault();
				if (event.key === '/' || event.key.length === 1) search.elem.focus();
			},
			{ signal: this.signal },
		);
	}
}
