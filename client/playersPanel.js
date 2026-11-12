import { Button, Card, Dialog, EmptyState, Input, Link, Notify, Select, theme } from '@vanilla-bean/components';

import { lastSaid, local } from './local';
import { Chip, Command, Meta, Row, Stack, Title } from './ui';

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

const said = (lines, key) => lines.map(line => line.match(new RegExp(`^\\s*${key} (\\S+)`))?.[1]).find(Boolean);

/** The page Microsoft's code is typed into, and the code, from the lines ender prints for them; no code from an ender too old to print one. */
export const signInLink = lines => {
	const link = said(lines, 'link');

	if (!link?.startsWith('https:')) return undefined;

	return { link, code: said(lines, 'code') };
};

/** Microsoft's sign in waits on a code typed in another tab, so the code and its page are shown as soon as ender has them. */
const signInRow = signal => {
	const status = new Meta();
	const prompt = new Row({ style: { display: 'none', flexWrap: 'wrap' } });
	const button = new Button({
		icon: 'right-to-bracket',
		variant: 'flat',
		textContent: 'Sign in to Microsoft',
		onPointerPress: async () => {
			button.options.disabled = true;

			try {
				const job = await local.signIn();
				let shownCode;
				const show = () => {
					const found = signInLink(job.lines);

					if (found && !found.code) {
						status.elem.textContent =
							'This ender prints no code for the page; update ender, or sign in with ender account add';

						return;
					}

					const waiting = found ? 'Waiting for you to finish in that tab' : 'Asking Microsoft for a code';

					status.elem.textContent = job.state === 'running' ? waiting : '';

					if (!found || found.code === shownCode) return;

					shownCode = found.code;
					prompt.elem.style.display = '';
					prompt.content([
						new Meta({ textContent: 'Your code' }),
						new Command({
							code: found.code,
							language: 'plaintext',
							multiline: true,
							copyButton: true,
							style: { fontSize: '1.3em', letterSpacing: '0.1em' },
						}),
						new Link({
							variant: 'button',
							href: found.link,
							target: '_blank',
							attributes: { rel: 'noopener noreferrer' },
							icon: 'arrow-up-right-from-square',
							textContent: "Open Microsoft's page",
						}),
					]);
				};

				show();
				local.watchJobs(show, signal);
				await local.finished(job, { reloading: false });
				told('success', lastSaid(job.lines) || 'Signed in');
			} catch (error) {
				told('danger', `The sign in did not finish: ${error.message}`);
			} finally {
				button.options.disabled = false;
				prompt.elem.style.display = 'none';
				status.elem.textContent = '';
				await local.refreshPlayers();
			}
		},
	});

	return new Stack({ style: { gap: theme.space.xs }, append: [new Row({ append: [button, status] }), prompt] });
};

const addOffline = () => {
	const name = new Input({
		placeholder: 'A name, 3 to 16 letters, digits or _',
		attributes: { 'aria-label': 'Player name' },
	});
	const add = () => {
		const named = String(name.options.value).trim();

		return attempt(
			async () => {
				await local.addPlayer(named);
				told('success', `${named} can play`);
			},
			`${named || 'That name'} was not added`,
		);
	};

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
			body.content(
				new EmptyState({
					icon: 'triangle-exclamation',
					title: 'ender could not list its players',
					message: playersError,
					action: { textContent: 'Try again', onPointerPress: () => local.refreshPlayers() },
				}),
			);

			return;
		}

		if (players === null) {
			body.content(
				new EmptyState({
					icon: 'circle-up',
					title: 'This ender is too old to manage players here',
					message: '"ender upgrade" brings it up to date.',
				}),
			);

			return;
		}

		if (players === undefined) {
			body.content(new EmptyState({ loading: true, title: 'Asking ender who can play' }));

			return;
		}

		body.content([
			...(players.accounts.length === 0
				? [
						new EmptyState({
							icon: 'user',
							title: 'No players yet',
							message: `The game plays offline as ${players.fallback}: add an offline player or sign in to Microsoft below.`,
						}),
					]
				: players.accounts.map(playerRow)),
			addOffline(),
			signInRow(signal),
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
