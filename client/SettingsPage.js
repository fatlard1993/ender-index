import { Content, EmptyState, Link, View, theme } from '@vanilla-bean/components';

import { enderPanel } from './enderPanel';
import { local } from './local';
import { playersPanel } from './playersPanel';
import { Command, LAUNCHER, Row, Stack, siteBar } from './ui';

/** The ender serving this page, kept apart from the instances it keeps: its version and update, and who plays. */
export default class SettingsPage extends View {
	build() {
		document.title = 'Settings :: ender index';

		const body = new Stack({ append: new EmptyState({ loading: true, title: 'Asking ender about itself' }) });

		this.content([
			siteBar('settings'),
			new Content({ column: 900, style: { paddingBlock: theme.space.md }, append: body }),
		]);

		local.ready().then(served => {
			if (this.signal.aborted) return;

			if (!served) {
				body.content(
					new EmptyState({
						icon: 'laptop',
						title: 'Settings are for the ender on your own machine',
						message: 'Run ender web, and this page shows its version, updates and players',
						append: new Row({
							append: [
								new Command({ code: 'ender web', copyButton: true }),
								new Link({ href: LAUNCHER, textContent: 'Get ender' }),
							],
						}),
					}),
				);

				return;
			}

			body.content([enderPanel(this.signal), playersPanel(this.signal)]);
		});
	}
}
