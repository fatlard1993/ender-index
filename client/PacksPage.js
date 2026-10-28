import { Button, Content, EmptyState, Input, Select, View, debounce } from '@vanilla-bean/components';

import { loadPacks } from './data';
import { packCard } from './packs';
import {
	LOADERS,
	PACK_FORMATS,
	PACK_JARS,
	PACK_SORTS,
	packFits,
	readPackQuery,
	sortPacks,
	writePackQuery,
} from './search';
import { Meta, Row, Stack, count, siteBar } from './ui';

const PAGE_SIZE = 25;

export default class PacksPage extends View {
	build() {
		const state = readPackQuery(location.search);
		const results = new Stack({ append: new EmptyState({ loading: true, title: 'Loading the packs' }) });
		const status = new Meta();
		let packs = [];
		let fitting = [];
		let shown = PAGE_SIZE;
		const more = new Button({
			variant: 'flat',
			textContent: 'Show more',
			style: { display: 'none', alignSelf: 'center' },
			onPointerPress: () => {
				shown += PAGE_SIZE;
				drawResults();
			},
		});

		const drawResults = () => {
			results.content(
				fitting.length > 0
					? fitting.slice(0, shown).map(packCard)
					: new EmptyState({
							icon: 'magnifying-glass',
							title: packs.length > 0 ? 'No packs match' : 'No packs are listed yet',
							message:
								packs.length > 0
									? 'Every word has to appear in its name or description, and it has to fit the filters'
									: 'The crawl lists packs it finds in repositories: an ender.pack.json or a packwiz pack.toml at the root, or .mrpack releases',
						}),
			);
			more.elem.style.display = fitting.length > shown ? '' : 'none';
		};

		const draw = () => {
			history.replaceState(null, '', `${location.pathname}${writePackQuery(state)}${location.hash}`);
			fitting = sortPacks(
				packs.filter(pack => packFits(pack, state)),
				state.sort,
			);
			shown = PAGE_SIZE;
			status.content(`${count(fitting.length)} of ${count(packs.length)} packs`);
			drawResults();
		};

		const choose = (key, options, any) =>
			new Select({
				options: [...(any ? [{ label: any, value: '' }] : []), ...options],
				value: state[key] ?? '',
				style: { width: 'auto' },
				onChange: ({ target: { value } }) => {
					state[key] = value || undefined;
					draw();
				},
			});
		const listed = labels => Object.entries(labels).map(([value, label]) => ({ label, value }));
		const minecraft = choose('minecraft', state.minecraft ? [state.minecraft] : [], 'Any Minecraft');

		this.content([
			siteBar('packs'),
			new Content({
				column: 900,
				style: { paddingBlock: '12px' },
				append: [
					new Meta({
						tag: 'p',
						textContent:
							'Modpacks kept in repositories, as an ender pack, a packwiz pack or .mrpack releases. ender import installs any of them; what a pack names is resolved against the index where it can be.',
					}),
					new Row({
						append: [
							new Input({
								type: 'search',
								placeholder: 'Search packs',
								value: state.query,
								style: { flex: '1', minWidth: '12em', width: 'auto' },
								onInput: debounce(({ target: { value } }) => {
									state.query = value;
									draw();
								}, 150),
							}),
							choose('sort', listed(PACK_SORTS)),
						],
					}),
					new Row({
						append: [
							minecraft,
							choose('loader', listed(LOADERS), 'Any loader'),
							choose('format', listed(PACK_FORMATS), 'Any format'),
							choose('jars', listed(PACK_JARS), 'Any jars'),
						],
					}),
					status,
					new Stack({ append: [results, more] }),
				],
			}),
		]);

		loadPacks()
			.then(found => {
				packs = found;

				const versions = [...new Set(packs.map(pack => pack.minecraft).filter(Boolean))].sort((a, b) =>
					b.localeCompare(a, undefined, { numeric: true }),
				);

				minecraft.options.options = [{ label: 'Any Minecraft', value: '' }, ...versions];
				minecraft.options.value = state.minecraft ?? '';
				draw();
			})
			.catch(error =>
				results.content(
					new EmptyState({
						icon: 'triangle-exclamation',
						title: 'The packs did not load',
						message: error.message,
						action: { textContent: 'Try again', onPointerPress: () => this.render() },
					}),
				),
			);
	}
}
