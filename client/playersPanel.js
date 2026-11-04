import { Button, Card, Dialog, Input, Notify, Select, theme } from '@vanilla-bean/components';

import { lastSaid, local } from './local';
import { Chip, Command, Meta, Row, Stack, Title, Warning } from './ui';

const told = (intent, content) => new Notify({ intent, content });

const KINDS = { offline: 'offline', microsoft: 'Microsoft' };

/** Runs a change to the players, saying what went wrong rather than leaving the list as it was without a word. */
const attempt = async (work, failed) => {
	try {
		await work();
	} catch (error) {
		told('danger', `${failed}: ${error.message}`);
	}
};

const playerRow = player =>
	new Row({
		append: [
			new Chip({ textContent: player.name }),
			new Meta({ textContent: KINDS[player.kind] ?? player.kind }),
			player.active
				? new Meta({ textContent: 'instances play as this one unless given another' })
				: new Button({
						icon: 'user',
						variant: 'flat',
						textContent: 'Play as',
						title: `Instances with no player of their own play as ${player.name}`,
						onPointerPress: () => attempt(() => local.usePlayer(player.name), `${player.name} was not chosen`),
					}),
			new Button({
				icon: 'xmark',
				variant: 'flat',
				title: `Forget ${player.name}`,
				onPointerPress: async () => {
					const body =
						player.kind === 'microsoft'
							? 'ender forgets its sign in; signing in again brings it back.'
							: 'Its worlds and inventories stay: they follow the name, and adding the name again finds them.';

					if (
						await Dialog.confirm({ header: `Forget ${player.name}?`, body, confirmLabel: 'Forget', intent: 'danger' })
					)
						attempt(() => local.removePlayer(player.name), `${player.name} was not forgotten`);
				},
			}),
		],
	});

/** Microsoft's sign in waits on a code typed in another tab, so its lines are shown as they come: they carry the code. */
const signInRow = (players, signal) => {
	if (!players.signIn) {
		return new Meta({
			tag: 'p',
			textContent:
				'Signing in to Microsoft needs an app registration of your own; "ender account add" in a terminal says how. Offline players need nothing.',
		});
	}

	const status = new Meta();
	const output = new Command({ tag: 'pre', style: { display: 'none', whiteSpace: 'pre-wrap', margin: 0 } });
	const button = new Button({
		icon: 'right-to-bracket',
		variant: 'flat',
		textContent: 'Sign in to Microsoft',
		onPointerPress: async () => {
			button.elem.disabled = true;

			try {
				const job = await local.signIn();
				const show = () => {
					output.elem.style.display = '';
					output.elem.textContent = job.lines.join('\n');
					status.elem.textContent = job.state === 'running' ? 'Waiting for the sign in to finish' : '';
				};

				show();
				local.watchJobs(show, signal);
				await local.finished(job, { reloading: false });
				told('success', lastSaid(job.lines) || 'Signed in');
			} catch (error) {
				told('danger', `The sign in did not finish: ${error.message}`);
			} finally {
				button.elem.disabled = false;
				await local.refreshPlayers();
			}
		},
	});

	return new Stack({ style: { gap: theme.space.xs }, append: [new Row({ append: [button, status] }), output] });
};

const addOffline = () => {
	const name = new Input({ placeholder: 'A name, 3 to 16 letters, digits or _' });
	const add = () =>
		attempt(
			async () => {
				await local.addPlayer(name.elem.value.trim());
				told('success', `${name.elem.value.trim()} can play`);
			},
			`${name.elem.value.trim() || 'That name'} was not added`,
		);

	name.elem.addEventListener('keydown', event => {
		if (event.key === 'Enter') add();
	});

	return new Row({
		append: [name, new Button({ icon: 'plus', textContent: 'Add an offline player', onPointerPress: add })],
	});
};

/** Who plays on this machine: ender's accounts, which one is used by default, and adding or forgetting one. */
export const playersPanel = signal => {
	const body = new Stack({ style: { gap: theme.space.sm } });
	let drawn;
	const draw = () => {
		const { players, playersError } = local;
		const shape = JSON.stringify([players, playersError]);

		if (shape === drawn) return;

		drawn = shape;

		if (playersError) {
			body.content(new Warning({ textContent: `ender could not list its players: ${playersError}` }));

			return;
		}

		if (players === null) {
			body.content(
				new Meta({
					tag: 'p',
					textContent: 'This ender is too old to manage players here; "ender upgrade" brings it up to date.',
				}),
			);

			return;
		}

		if (players === undefined) {
			body.content(new Meta({ textContent: 'Asking ender who can play' }));

			return;
		}

		body.content([
			...(players.accounts.length === 0
				? [new Meta({ tag: 'p', textContent: `No players yet: the game plays offline as ${players.fallback}.` })]
				: players.accounts.map(playerRow)),
			addOffline(),
			signInRow(players, signal),
		]);
	};

	draw();
	local.subscribe(draw, signal);
	local.loadPlayers();

	return new Card(
		{},
		new Stack({ style: { gap: theme.space.md }, append: [new Title({ textContent: 'Players' }), body] }),
	);
};

/** The player one instance plays as: the active one by default, or one of its own. */
export const playerChoice = instance => {
	const { players } = local;

	if (!players || players.accounts.length === 0) return [];

	const active = players.accounts.find(player => player.active)?.name ?? players.fallback;

	return [
		new Select({
			title: `Who ${instance.name} plays as`,
			options: [
				{ label: `plays as the active player (${active})`, value: '' },
				...players.accounts.map(player => ({ label: `plays as ${player.name}`, value: player.name })),
			],
			value: instance.account ?? '',
			onChange: ({ target: { value } }) =>
				attempt(() => local.assignPlayer(instance.name, value || null), `${instance.name}'s player did not change`),
		}),
	];
};
