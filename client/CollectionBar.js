import { Button, Component, Content, Link, Notify, styled, theme } from '@vanilla-bean/components';

import { collection } from './collection';
import { runLocally } from './controls';
import { local } from './local';
import { packDialog } from './packMaker';
import { installAllCommand, modPath } from './search';
import { Command, Row, Stack } from './ui';
import { hrefOf } from './route';

/** Docked under the view, it scrolls as a Content once the list is taller than half the screen. */
const Bar = styled(
	Content,
	({ colors, space }) => `
		flex: none;
		display: flex;
		flex-direction: column;
		gap: ${space.sm};
		max-height: 50%;
		margin: 0;
		padding-block: ${space.sm};
		border-top: 1px solid ${colors.border};
		background: ${colors.surface};

		&.empty {
			display: none;
		}
	`,
	{ column: 900 },
);

/** Empties the collection at once, with an Undo that brings every mod back. */
const emptyCollection = () => {
	const kept = collection.items;

	collection.clear();
	new Notify({
		intent: 'success',
		content: `Emptied the collection of ${kept.length === 1 ? 'one mod' : `${kept.length} mods`}`,
		actions: [
			{
				textContent: 'Undo',
				onPointerPress: () => {
					for (const item of kept) if (!collection.has(item)) collection.toggle(item, item.title);
				},
			},
		],
	});
};

export default class CollectionBar extends Bar {
	build() {
		let open = false;

		const draw = items => {
			this.toggleClass('empty', items.length === 0);

			if (items.length === 0) {
				open = false;
				this.empty();

				return;
			}

			const command = installAllCommand(items, { instance: local.selected });

			this.content([
				new Row({
					append: [
						new Button({
							variant: 'flat',
							icon: open ? 'chevron-down' : 'chevron-up',
							textContent: `${items.length} collected`,
							tooltip: open ? 'Hide the list' : 'Show the list',
							onPointerPress: () => {
								open = !open;
								draw(collection.items);
							},
						}),
						new Command({ code: command, multiline: true, copyButton: true, style: { flex: '1', minWidth: '12em' } }),
						...(local.selected
							? [
									new Button({
										icon: 'download',
										textContent: `Install all into ${local.selected}`,
										onPointerPress: () => runLocally('add', collection.items),
									}),
								]
							: []),
						new Button({
							variant: 'flat',
							icon: 'box',
							textContent: 'Make a pack',
							tooltip: 'An ender pack of these mods, to share or to make an instance of',
							onPointerPress: () => packDialog(collection.items),
						}),
						new Button({
							variant: 'flat',
							icon: 'trash',
							tooltip: 'Empty the collection',
							onPointerPress: () => emptyCollection(),
						}),
					],
				}),
				...(open
					? [
							new Stack({
								style: { gap: theme.space.xs },
								append: items.map(
									item =>
										new Row({
											append: [
												new Button({
													variant: 'flat',
													icon: 'xmark',
													tooltip: `Take ${item.title ?? item.repo} out`,
													onPointerPress: () => collection.toggle(item),
												}),
												new Link({ href: hrefOf(modPath(item)), textContent: item.title ?? item.repo }),
												new Component({ tag: 'span', textContent: item.repo, style: { opacity: 0.6 } }),
											],
										}),
								),
							}),
						]
					: []),
			]);
		};

		collection.subscribe(draw, this.signal);
		local.subscribe(() => draw(collection.items), this.signal);
		draw(collection.items);
	}
}
