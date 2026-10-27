import {
	Button,
	Card,
	Content,
	EmptyState,
	Input,
	Link,
	Select,
	View,
	debounce,
	theme,
} from '@vanilla-bean/components';

import { loadListing, loadPacks } from './data';
import { LOADERS, collectionKey, packFits, repositoryUrl } from './search';
import { Chip, Command, Meta, Row, Stack, Title, about, copyCommand, count, date, siteBar, tiles } from './ui';

const FORMATS = { ender: 'ender pack', packwiz: 'packwiz', mrpack: '.mrpack' };

const packCard = (pack, byKey) => {
	const indexed = pack.matched.map(key => byKey.get(key)).filter(Boolean);
	const mods = new Stack({ style: { display: 'none', marginTop: theme.space.sm } });
	const toggle = new Button({
		variant: 'flat',
		icon: 'chevron-down',
		textContent: `The ${count(indexed.length)} in the index`,
		onPointerPress: () => {
			const opening = mods.elem.style.display === 'none';

			if (opening && mods.elem.childElementCount === 0) mods.content(tiles(indexed, indexed.length));
			mods.elem.style.display = opening ? '' : 'none';
			toggle.options.icon = opening ? 'chevron-up' : 'chevron-down';
		},
	});

	return new Card(
		{},
		new Stack({
			style: { gap: theme.space.sm },
			append: [
				new Row({
					append: [
						new Title({ textContent: pack.name }),
						new Link({ href: repositoryUrl(pack), target: '_blank', textContent: pack.repo }),
						new Meta({
							textContent: [`${count(pack.stars ?? 0)} stars`, pack.pushed && `last pushed ${date(pack.pushed)}`]
								.filter(Boolean)
								.join(' · '),
						}),
					],
				}),
				...about(pack.description ? { text: pack.description } : undefined),
				new Row({
					append: [
						...pack.formats.map(format => new Chip({ textContent: FORMATS[format] ?? format })),
						...(pack.minecraft ? [new Chip({ textContent: `Minecraft ${pack.minecraft}` })] : []),
						...(pack.loader && pack.loader !== 'vanilla'
							? [new Chip({ textContent: LOADERS[pack.loader] ?? pack.loader })]
							: []),
						new Meta({ textContent: `${count(pack.count)} mods, ${count(indexed.length)} of them in the index` }),
					],
				}),
				new Row({
					append: [
						new Command({ tag: 'code', textContent: pack.install }),
						new Button({
							icon: 'copy',
							variant: 'flat',
							title: 'Copy',
							onPointerPress: () => copyCommand(pack.install),
						}),
						...(indexed.length > 0 ? [toggle] : []),
					],
				}),
				mods,
			],
		}),
	);
};

export default class PacksPage extends View {
	build() {
		const state = { query: '' };
		const results = new Stack({ append: new EmptyState({ loading: true, title: 'Loading the packs' }) });
		const status = new Meta();
		let packs = [];
		let byKey = new Map();

		const draw = () => {
			const shown = packs.filter(pack => packFits(pack, state));

			status.content(`${count(shown.length)} of ${count(packs.length)} packs, the most starred first`);
			results.content(
				shown.length > 0
					? shown.slice(0, 50).map(pack => packCard(pack, byKey))
					: new EmptyState({
							icon: 'magnifying-glass',
							title: packs.length > 0 ? 'No packs match' : 'No packs are listed yet',
							message:
								packs.length > 0
									? 'Every word has to appear in its name or description, and its version and loader have to be the ones chosen'
									: 'The crawl lists packs it finds in repositories: an ender.pack.json or a packwiz pack.toml at the root, or .mrpack releases',
						}),
			);
		};

		const minecraft = new Select({
			options: [{ label: 'Any Minecraft', value: '' }],
			value: '',
			style: { width: 'auto' },
			onChange: ({ target: { value } }) => {
				state.minecraft = value || undefined;
				draw();
			},
		});
		const loader = new Select({
			options: [
				{ label: 'Any loader', value: '' },
				...Object.entries(LOADERS).map(([value, label]) => ({ label, value })),
			],
			value: '',
			style: { width: 'auto' },
			onChange: ({ target: { value } }) => {
				state.loader = value || undefined;
				draw();
			},
		});

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
								style: { flex: '1', minWidth: '12em', width: 'auto' },
								onInput: debounce(({ target: { value } }) => {
									state.query = value;
									draw();
								}, 150),
							}),
							minecraft,
							loader,
						],
					}),
					status,
					results,
				],
			}),
		]);

		Promise.all([loadPacks(), loadListing().catch(() => [])])
			.then(([found, listing]) => {
				packs = found;
				byKey = new Map(listing.map(entry => [collectionKey(entry), entry]));

				const versions = [...new Set(packs.map(pack => pack.minecraft).filter(Boolean))].sort((a, b) =>
					b.localeCompare(a, undefined, { numeric: true }),
				);

				minecraft.options.options = [{ label: 'Any Minecraft', value: '' }, ...versions];
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
