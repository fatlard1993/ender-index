import { Button, Card, Link, Notify, SectionLabel, theme } from '@vanilla-bean/components';

import { local, updateReady } from './local';
import { Command, Meta, Row, Stack } from './ui';

const updateButton = upgrade => {
	const status = new Meta();
	const button = new Button({
		icon: 'download',
		textContent: `Update to ${upgrade.latest}`,
		onPointerPress: async () => {
			button.options.disabled = true;
			status.elem.textContent = `Downloading ender ${upgrade.latest}; the page reloads once it is running`;

			try {
				await local.upgradeEnder();
			} catch (error) {
				new Notify({ intent: 'danger', content: `ender was not updated: ${error.message}` });
				status.elem.textContent = '';
				button.options.disabled = false;
			}
		},
	});

	return [button, status];
};

const howTo = {
	self: updateButton,
	brew: () => [
		new Meta({ textContent: 'Homebrew keeps it:' }),
		new Command({ code: 'brew upgrade ender', multiline: true, copyButton: true }),
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
		append: [new Meta({ textContent: label }), new Command({ code: path })],
	});

const terminalLabel = () => new Meta({ textContent: 'Terminal' });

const saying = text => new Row({ append: [terminalLabel(), new Meta({ textContent: text })] });

/**
 * Whether /usr/local/bin/ender is Ender.app's ender: once it is, why it cannot be linked from where Ender runs, what
 * other ender is there, or the button and the line to paste that link it.
 */
export const terminalRow = terminal => {
	if (!terminal) return [];
	if (terminal.linked) return [saying('ender works in Terminal')];
	if (terminal.refused) return [saying(terminal.refused)];
	if (terminal.occupied) return [saying(`Terminal's ender is ${terminal.occupied}; Ender leaves it in place`)];

	const status = new Meta();
	const button = new Button({
		icon: 'terminal',
		variant: 'flat',
		textContent: 'Add ender to Terminal',
		onPointerPress: async () => {
			button.options.disabled = true;
			status.elem.textContent = "Waiting for your password in macOS's dialog";

			try {
				await local.linkTerminal();

				if (!local.ender?.terminal?.linked)
					throw new Error('macOS answered, but /usr/local/bin/ender is still not this one');
			} catch (error) {
				new Notify({ intent: 'danger', content: `ender was not added to Terminal: ${error.message}` });
				button.options.disabled = false;
				status.elem.textContent = '';
			}
		},
	});

	return [
		new Row({
			style: { flexWrap: 'wrap' },
			append: [terminalLabel(), new Meta({ textContent: 'ender is not a command there yet' }), button, status],
		}),
		new Row({
			style: { flexWrap: 'wrap' },
			append: [
				new Meta({ textContent: 'or paste' }),
				new Command({ code: terminal.line, multiline: true, copyButton: true }),
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
		new Stack({ style: { gap: theme.space.md }, append: [new SectionLabel({ level: 2, textContent: 'ender' }), body] }),
	);
};
