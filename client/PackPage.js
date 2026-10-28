import { Content, EmptyState, Link, View, styled, theme } from '@vanilla-bean/components';

import { loadListing, loadPackPage } from './data';
import { installRow, packChips, packStats, packWarnings } from './packs';
import { collectionKey, repositoryUrl } from './search';
import { Chip, Meta, Row, Stack, about, breadcrumbs, count, siteBar, tiles } from './ui';

const Heading = styled.Component(
	() => `
		margin: 0;
		font-size: 1.6em;
		overflow-wrap: anywhere;
	`,
);

const JARS = { modrinth: 'jar from Modrinth', link: 'jar from its own link', none: 'no jar found' };

/** A mod the index has not got: its name, where its jar comes from, and its source and Modrinth page where it has them. */
const outsideMod = mod =>
	new Row({
		append: [
			new Chip({ textContent: mod.name }),
			new Meta({ textContent: JARS[mod.jar] }),
			...(mod.source ? [new Link({ href: mod.source, target: '_blank', textContent: 'source' })] : []),
			...(mod.modrinth
				? [new Link({ href: `https://modrinth.com/mod/${mod.modrinth}`, target: '_blank', textContent: 'Modrinth' })]
				: []),
		],
	});

const section = (title, explained, content) =>
	new Stack({
		style: { gap: theme.space.sm, marginTop: theme.space.lg },
		append: [
			new Heading({ tag: 'h2', style: { fontSize: '1.2em' }, textContent: title }),
			new Meta({ tag: 'p', textContent: explained }),
			...content,
		],
	});

export default class PackPage extends View {
	build() {
		const { owner, name } = this.options;
		const repo = `${owner}/${name}`;
		const crumbs = new Stack({ append: breadcrumbs({ label: 'Packs', href: '#/packs' }, { label: repo }) });
		const body = new Stack({ append: new EmptyState({ loading: true, title: `Loading ${repo}` }) });

		this.content([
			siteBar('packs'),
			new Content({ column: 900, style: { paddingBlock: '12px' }, append: [crumbs, body] }),
		]);

		Promise.all([loadPackPage(repo), loadListing().catch(() => [])])
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
				crumbs.content(breadcrumbs({ label: 'Packs', href: '#/packs' }, { label: pack.name }));

				const byKey = new Map(listing.map(entry => [collectionKey(entry), entry]));
				const indexed = pack.matched.map(key => byKey.get(key)).filter(Boolean);
				const outside = pack.mods.filter(mod => !mod.key);
				const sourced = outside.filter(mod => mod.source);
				const unsourced = outside.filter(mod => !mod.source);

				body.content([
					new Stack({
						style: { gap: theme.space.sm },
						append: [
							new Heading({ tag: 'h1', textContent: pack.name }),
							new Row({
								append: [
									new Link({ href: repositoryUrl(pack), target: '_blank', textContent: pack.repo }),
									new Meta({ textContent: packStats(pack) }),
								],
							}),
							...about(pack.description ? { text: pack.description } : undefined),
							new Row({
								append: [
									...packChips(pack),
									new Meta({
										textContent: `${count(pack.count)} mods, ${count(pack.matched.length)} of them in the index`,
									}),
								],
							}),
							...packWarnings(pack),
							installRow(pack),
						],
					}),
					...(indexed.length > 0
						? [
								section(
									`In the index (${count(indexed.length)})`,
									'Read from their source and its releases, as every mod in the index is.',
									[tiles(indexed, indexed.length)],
								),
							]
						: []),
					...(sourced.length > 0
						? [
								section(
									`Source known, not in the index (${count(sourced.length)})`,
									'Their source is linked, but the index has no jar of theirs from it: their authors put their jars on Modrinth or elsewhere, or the crawl has not read them yet.',
									sourced.map(outsideMod),
								),
							]
						: []),
					...(unsourced.length > 0
						? [
								section(
									`No source found (${count(unsourced.length)})`,
									'Nothing they are published with links a source the index can read.',
									unsourced.map(outsideMod),
								),
							]
						: []),
				]);
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
	}
}
