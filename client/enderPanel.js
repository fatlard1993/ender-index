import { Button, Card, Notify, theme } from '@vanilla-bean/components';

import { local } from './local';
import { Command, Meta, Row, Stack } from './ui';

/** Whether release `latest` is past `current`, by their dotted numbers. */
export const isNewer = (latest, current) => {
	const parts = version => version.split(/[.+-]/).slice(0, 3).map(Number);
	const [a, b] = [parts(latest), parts(current)];

	for (let index = 0; index < 3; ++index) {
		if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
	}

	return false;
};

const updateButton = upgrade => {
	const status = new Meta();
	const button = new Button({
		icon: 'download',
		textContent: `Update to ${upgrade.latest}`,
		onPointerPress: async () => {
			button.elem.disabled = true;
			status.elem.textContent = `Downloading ender ${upgrade.latest}; the page reloads once it is running`;

			try {
				await local.upgradeEnder();
			} catch (error) {
				new Notify({ intent: 'danger', content: `ender was not updated: ${error.message}` });
				status.elem.textContent = '';
				button.elem.disabled = false;
			}
		},
	});

	return [button, status];
};

const howTo = {
	self: updateButton,
	brew: () => [
		new Meta({ textContent: 'Homebrew keeps it:' }),
		new Command({ tag: 'code', textContent: 'brew upgrade ender' }),
	],
	checkout: () => [
		new Meta({ textContent: "It runs from a checkout: git pull in ender's folder brings it up to date" }),
	],
};

/** Which ender serves this page, and a way to the newest when there is one. */
export const enderPanel = signal => {
	const body = new Stack({ style: { gap: theme.space.xs } });
	let drawn;
	const draw = () => {
		const { upgrade } = local;
		const shape = JSON.stringify(upgrade);

		if (shape === drawn) return;

		drawn = shape;

		if (!upgrade) {
			body.content([]);

			return;
		}

		if (upgrade.error || !upgrade.latest) {
			body.content(
				new Meta({
					textContent: `ender ${upgrade.current ?? ''}; could not ask GitHub for a newer one: ${upgrade.error}`,
				}),
			);

			return;
		}

		if (!isNewer(upgrade.latest, upgrade.current)) {
			body.content(new Meta({ textContent: `ender ${upgrade.current}, the newest release` }));

			return;
		}

		body.content(
			new Card(
				{},
				new Row({
					style: { flexWrap: 'wrap' },
					append: [
						new Meta({ textContent: `ender ${upgrade.latest} is out; this is ${upgrade.current}.` }),
						...(howTo[upgrade.how] ?? howTo.checkout)(upgrade),
					],
				}),
			),
		);
	};

	draw();
	local.subscribe(draw, signal);
	local.loadUpgrade();

	return body;
};
