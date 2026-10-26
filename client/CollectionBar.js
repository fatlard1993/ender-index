import { Button, Component, Link, styled, theme } from '@vanilla-bean/components';

import { collection } from './collection';
import { runLocally } from './controls';
import { local } from './local';
import { installAllCommand, modPath } from './search';
import { Command, Row, Stack, copyCommand } from './ui';

const Bar = styled.Component(
	({ colors, space }) => `
		flex: none;
		display: flex;
		flex-direction: column;
		gap: ${space.sm};
		max-height: 50%;
		overflow: auto;
		padding: ${space.sm} max(${space.md}, (100% - 900px) / 2);
		border-top: 1px solid ${colors.border};
		background: ${colors.surface};

		&.empty {
			display: none;
		}
	`,
);

/** The mods gathered so far, and the one line that installs them all. */
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
							title: open ? 'Hide the list' : 'Show the list',
							onPointerPress: () => {
								open = !open;
								draw(collection.items);
							},
						}),
						new Command({ tag: 'code', textContent: command, style: { flex: '1', minWidth: '12em' } }),
						new Button({
							icon: 'copy',
							variant: local.selected ? 'flat' : undefined,
							textContent: 'Copy',
							onPointerPress: () => copyCommand(command),
						}),
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
							icon: 'trash',
							title: 'Empty the collection',
							onPointerPress: collection.clear,
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
													title: `Take ${item.title ?? item.repo} out`,
													onPointerPress: () => collection.toggle(item),
												}),
												new Link({ href: `#${modPath(item)}`, textContent: item.title ?? item.repo }),
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
