import {
	Button,
	Card,
	Component,
	Content,
	EmptyState,
	Input,
	Link,
	Notify,
	Select,
	Tabs,
	Toolbar,
	copyToClipboard,
	debounce,
	styled,
	theme,
} from '@vanilla-bean/components';
import { HOSTS, rank } from 'ender-launcher/rank';

import {
	CAPABILITIES,
	INDEX,
	LOADERS,
	MANIFEST,
	REPOSITORY,
	fittingVersions,
	installCommand,
	loadersOf,
	readQuery,
	releaseUrl,
	releasedVersions,
	releasesUrl,
	repositoryUrl,
	titleOf,
	writeQuery,
} from './search';

const PAGE_SIZE = 25;

const count = number => number.toLocaleString('en-US');

const Stack = styled.Component(
	({ space }) => `
		display: flex;
		flex-direction: column;
		gap: ${space.md};
	`,
);

const Row = styled.Component(
	({ space }) => `
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: ${space.sm};
	`,
);

const Meta = styled.Component(
	({ colors }) => `
		color: ${colors.muted};
		font-size: 0.85em;
	`,
);

const Title = styled.Component(
	() => `
		font-weight: bold;
		font-size: 1.1em;
	`,
);

const Chip = styled.Component(
	({ colors, radius, space }) => `
		border: 1px solid ${colors.border};
		border-radius: ${radius.pill};
		padding: 0 ${space.sm};
		font-size: 0.8em;

		&.finding {
			border-color: ${colors.alpha(colors.warning, 0.6)};
			color: ${colors.warning};
		}
	`,
);

const Warning = styled.Component(
	({ colors }) => `
		color: ${colors.warning};
		font-size: 0.9em;
	`,
);

const Command = styled.Component(
	({ colors, radius, space }) => `
		background: ${colors.overlay};
		border-radius: ${radius.sm};
		padding: ${space.xs} ${space.sm};
		font-size: 0.9em;
		user-select: all;
	`,
);

const loadJson = async (url, signal) => {
	const response = await fetch(url, { signal });

	if (!response.ok) throw new Error(`${url} answered ${response.status}`);

	return response.json();
};

const copyCommand = async command => {
	const copied = await copyToClipboard(command);

	new Notify({
		intent: copied ? 'success' : 'warning',
		content: copied ? `Copied ${command}` : 'The clipboard is out of reach here; select the command and copy it',
	});
};

const resultCard = ({ entry, sharing }, versions, { minecraft }) => {
	const host = entry.host ?? 'github';
	const fitting = fittingVersions(entry, versions, { minecraft });
	const command = installCommand(entry);
	const capabilities = entry.latest?.capabilities ?? [];

	return new Card(
		{ accent: sharing || entry.replaced ? theme.colors.warning : undefined },
		new Row({
			append: [
				new Title({ textContent: titleOf(entry) }),
				new Link({
					href: repositoryUrl(entry),
					target: '_blank',
					textContent: host === 'github' ? entry.repo : `${entry.repo} on ${HOSTS[host]}`,
				}),
				new Meta({ textContent: `${count(entry.stars ?? 0)} stars` }),
			],
		}),
		...(entry.description ? [new Component({ tag: 'p', textContent: entry.description, style: { margin: 0 } })] : []),
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
						new Chip({ addClass: 'finding', textContent: `reaches ${capability}`, title: CAPABILITIES[capability] }),
				),
			],
		}),
		...(sharing ? [new Warning({ textContent: `It ${sharing}: check you have the one you mean` })] : []),
		...(entry.replaced
			? [new Warning({ textContent: 'A jar in one of its releases was changed after publishing' })]
			: []),
		new Row({
			append: [
				new Command({ tag: 'code', textContent: command }),
				new Button({ icon: 'copy', variant: 'flat', title: 'Copy', onPointerPress: () => copyCommand(command) }),
				minecraft
					? new Link({ href: releasesUrl(entry), target: '_blank', textContent: 'Releases' })
					: new Link({ href: releaseUrl(entry), target: '_blank', textContent: `Release ${entry.latest.tag}` }),
			],
		}),
	);
};

export default class SearchPage extends Component {
	build() {
		const state = readQuery(location.search);
		let entries;
		let versions = [];
		let shown = PAGE_SIZE;

		const results = new Stack({ append: new EmptyState({ loading: true, title: 'Loading the index' }) });
		const status = new Meta();
		const more = new Button({
			variant: 'flat',
			textContent: 'Show more',
			style: { display: 'none', alignSelf: 'center' },
			onPointerPress: () => {
				shown += PAGE_SIZE;
				render();
			},
		});

		const render = () => {
			if (entries === undefined) return;

			history.replaceState(null, '', `${location.pathname}${writeQuery(state)}`);

			const ranked = rank(entries, state.query, state);

			status.content(
				`${count(ranked.length)} of ${count(entries.length)} indexed repositories${state.query.trim() ? '' : ', by stars'}`,
			);
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

		const search = new Input({
			type: 'search',
			value: state.query,
			placeholder: 'Search mods: lithium, fabric api, backpacks',
			style: { flex: '1', minWidth: '12em', width: 'auto' },
			onInput: debounce(({ target: { value } }) => {
				state.query = value;
				shown = PAGE_SIZE;
				render();
			}, 150),
		});

		const minecraft = new Select({
			options: [{ label: 'Any Minecraft', value: '' }, ...(state.minecraft ? [state.minecraft] : [])],
			value: state.minecraft ?? '',
			style: { width: 'auto' },
			onChange: ({ target: { value } }) => {
				state.minecraft = value || undefined;
				shown = PAGE_SIZE;
				render();
			},
		});

		const loader = new Tabs({
			variant: 'segmented',
			tabs: [{ id: 'any', label: 'Any' }, ...Object.entries(LOADERS).map(([id, label]) => ({ id, label }))],
			selected: state.loader ?? 'any',
			onChange: ({ value }) => {
				state.loader = value === 'any' ? undefined : value;
				shown = PAGE_SIZE;
				render();
			},
		});

		const versionList = loadJson(MANIFEST, this.signal)
			.then(releasedVersions)
			.catch(error => {
				if (error.name === 'AbortError') return [];

				new Notify({
					intent: 'warning',
					content: `Mojang's version list did not load (${error.message}), so results do not say which versions they fit`,
				});

				return [];
			});

		Promise.all([loadJson(`${INDEX}/search.json`, this.signal), versionList])
			.then(([listing, released]) => {
				entries = listing.filter(entry => !entry.archived);
				versions = released;
				minecraft.options.options = [
					{ label: 'Any Minecraft', value: '' },
					...new Set([...(state.minecraft ? [state.minecraft] : []), ...released]),
				];
				minecraft.options.value = state.minecraft ?? '';
				render();
			})
			.catch(error => {
				if (error.name === 'AbortError') return;

				results.content(
					new EmptyState({
						icon: 'triangle-exclamation',
						title: 'The index did not load',
						message: `${INDEX}/search.json: ${error.message}`,
					}),
				);
			});

		this.content([
			new Toolbar({
				variant: 'bar',
				heading: 'ender index',
				append: [new Link({ variant: 'flat', href: REPOSITORY, target: '_blank', textContent: 'Source' })],
			}),
			new Content({
				column: 900,
				style: { paddingBlock: '12px' },
				append: [
					new Meta({
						tag: 'p',
						textContent:
							'Minecraft mods found where their source lives. Every jar here came from the releases of its own repository and was scanned by ender: what its code can reach is a finding, not a verdict.',
					}),
					new Toolbar({ style: { margin: '12px 0 4px' }, append: [search, minecraft, loader] }),
					status,
					new Stack({ style: { marginTop: '12px' }, append: [results, more] }),
				],
			}),
		]);

		search.elem.focus();
	}
}
