import { Button, Card, Link, Notify, theme } from '@vanilla-bean/components';

import { local, updateReady } from './local';
import { Command, Meta, Row, Stack, Title } from './ui';

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

const RELEASES = 'https://github.com/fatlard1993/ender-launcher/releases';

const versionLine = upgrade => {
	if (!upgrade) return [];

	if (upgrade.error || !upgrade.latest) {
		return [
			new Meta({
				tag: 'p',
				textContent: `ender ${upgrade.current ?? ''}; could not ask GitHub for a newer one: ${upgrade.error}`,
			}),
		];
	}

	if (!updateReady(upgrade))
		return [new Meta({ tag: 'p', textContent: `ender ${upgrade.current}, the newest release` })];

	return [
		new Row({
			style: { flexWrap: 'wrap' },
			append: [
				new Meta({ textContent: `ender ${upgrade.latest} is out; this is ${upgrade.current}.` }),
				...(howTo[upgrade.how] ?? howTo.checkout)(upgrade),
			],
		}),
	];
};

const placeRow = (label, path) =>
	new Row({
		style: { flexWrap: 'wrap' },
		append: [new Meta({ textContent: label }), new Command({ tag: 'code', textContent: path })],
	});

const terminalLabel = () => new Meta({ textContent: 'Terminal' });

/** Whether a Mac's Terminal has Ender.app's ender, and the button or the line that gives it, when it does not. */
export const terminalRow = terminal => {
	if (!terminal) return [];

	if (terminal.linked) {
		return [new Row({ append: [terminalLabel(), new Meta({ textContent: 'ender works in Terminal' })] })];
	}

	if (terminal.refused) return [new Row({ append: [terminalLabel(), new Meta({ textContent: terminal.refused })] })];

	const button = new Button({
		icon: 'terminal',
		variant: 'flat',
		textContent: 'Add ender to Terminal',
		title: 'macOS asks for your password to link it into /usr/local/bin',
		onPointerPress: async () => {
			button.elem.disabled = true;

			try {
				await local.linkTerminal();
			} catch (error) {
				new Notify({ intent: 'danger', content: `ender was not added to Terminal: ${error.message}` });
				button.elem.disabled = false;
			}
		},
	});

	return [
		new Row({
			style: { flexWrap: 'wrap' },
			append: [
				terminalLabel(),
				new Meta({ textContent: 'ender is not a command there yet' }),
				button,
				new Meta({ textContent: 'or paste' }),
				new Command({ tag: 'code', textContent: terminal.line }),
			],
		}),
	];
};

/** Which ender serves this page, a way to the newest when there is one, and where it lives on this machine. */
export const enderPanel = signal => {
	const body = new Stack({ style: { gap: theme.space.sm } });
	let drawn;
	const draw = () => {
		const { upgrade, ender } = local;
		const shape = JSON.stringify([upgrade, ender]);

		if (shape === drawn) return;

		drawn = shape;
		body.content([
			...versionLine(upgrade),
			...(ender?.installed ? [placeRow('Installed at', ender.installed)] : []),
			...terminalRow(ender?.terminal),
			...(ender?.data ? [placeRow('Keeps instances, worlds and downloads in', ender.data)] : []),
			new Row({
				append: [
					new Button({
						icon: 'rotate',
						variant: 'flat',
						textContent: 'Check for updates',
						title: 'Ask GitHub for the newest release now',
						onPointerPress: () => local.loadUpgrade({ again: true }),
					}),
					new Link({ href: RELEASES, target: '_blank', textContent: 'What each release changed' }),
				],
			}),
		]);
	};

	draw();
	local.subscribe(draw, signal);
	local.loadUpgrade();

	return new Card(
		{},
		new Stack({ style: { gap: theme.space.md }, append: [new Title({ textContent: 'ender' }), body] }),
	);
};
