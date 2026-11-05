import { Button, Card, Component, Dialog, Input, Link, Notify, Select, theme } from '@vanilla-bean/components';

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

/** The steps to an Azure app of one's own, which Microsoft requires of a launcher before it may sign anyone in. */
export const REGISTRATION_STEPS = [
	[
		'Register an application at ',
		{
			href: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
			text: 'the Azure portal',
		},
		' (Microsoft Entra ID, App registrations).',
	],
	['Under Authentication, add a "Mobile and desktop applications" platform and allow public client flows.'],
	[
		'Apply for Minecraft API access for it at ',
		{ href: 'https://aka.ms/mce-reviewappid', text: "Microsoft's review form" },
		'; approval can take days.',
	],
	['Paste its Application (client) ID here.'],
];

const stepItem = parts =>
	new Component({
		tag: 'li',
		append: parts.map(part =>
			typeof part === 'string' ? part : new Link({ href: part.href, target: '_blank', textContent: part.text }),
		),
	});

/** Where a player without a registration says which one to use: Microsoft signs no one in through a launcher without one. */
const clientIdForm = ({ open = false } = {}) => {
	const field = new Input({ placeholder: 'Application (client) ID, like 1a2b3c4d-...' });
	const save = () =>
		attempt(async () => {
			await local.setClientId(field.elem.value.trim());
			told('success', 'Saved; signing in to Microsoft is ready');
		}, 'The client id was not saved');

	field.elem.addEventListener('keydown', event => {
		if (event.key === 'Enter') save();
	});

	return new Component({
		tag: 'details',
		attributes: open ? { open: '' } : {},
		append: [
			new Meta({ tag: 'summary', textContent: 'Set up Microsoft sign in', style: { cursor: 'pointer' } }),
			new Stack({
				style: { gap: theme.space.xs, marginTop: theme.space.xs },
				append: [
					new Meta({
						tag: 'p',
						textContent:
							'Signing in to Microsoft needs an Azure app registration of your own, approved for Minecraft. Offline players need none of this.',
					}),
					new Meta({
						tag: 'ol',
						style: { margin: 0, paddingInlineStart: '1.5em' },
						append: REGISTRATION_STEPS.map(stepItem),
					}),
					new Row({ append: [field, new Button({ icon: 'floppy-disk', textContent: 'Save', onPointerPress: save })] }),
				],
			}),
		],
	});
};

/** The page Microsoft's code is typed into, with the code filled in, from the line ender prints for it. */
export const signInLink = lines => {
	const link = lines.map(line => line.match(/^\s*link (https:\S+)/)?.[1]).find(Boolean);

	if (!link) return undefined;

	return { link, code: new URL(link).searchParams.get('otc') ?? '' };
};

/** Microsoft's sign in waits on a code typed in another tab, so the code and its page are shown as soon as ender has them. */
const signInRow = (players, signal) => {
	if (!players.signIn) return clientIdForm();

	const status = new Meta();
	const prompt = new Row({ style: { display: 'none', flexWrap: 'wrap' } });
	const button = new Button({
		icon: 'right-to-bracket',
		variant: 'flat',
		textContent: 'Sign in to Microsoft',
		onPointerPress: async () => {
			button.elem.disabled = true;

			try {
				const job = await local.signIn();
				let shownLink;
				const show = () => {
					const found = signInLink(job.lines);

					const waiting = found ? 'Waiting for you to finish in that tab' : 'Asking Microsoft for a code';

					status.elem.textContent = job.state === 'running' ? waiting : '';

					if (!found || found.link === shownLink) return;

					shownLink = found.link;
					prompt.elem.style.display = '';
					prompt.content([
						new Meta({ textContent: 'Your code' }),
						new Command({ tag: 'code', textContent: found.code, style: { fontSize: '1.3em', letterSpacing: '0.1em' } }),
						new Button({
							icon: 'arrow-up-right-from-square',
							textContent: "Open Microsoft's page",
							title: found.link,
							onPointerPress: () => window.open(found.link, '_blank', 'noopener'),
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
				button.elem.disabled = false;
				prompt.elem.style.display = 'none';
				status.elem.textContent = '';
				await local.refreshPlayers();
			}
		},
	});

	const stack = new Stack({ style: { gap: theme.space.xs } });
	const change = new Button({
		icon: 'pen',
		variant: 'flat',
		textContent: 'Change client id',
		title: 'Use another Azure app registration',
		onPointerPress: () => stack.content([new Row({ append: [button, status] }), prompt, clientIdForm({ open: true })]),
	});

	stack.content([new Row({ append: [button, change, status] }), prompt]);

	return stack;
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
