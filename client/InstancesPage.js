import {
	Button,
	Card,
	Component,
	Content,
	Dialog,
	EmptyState,
	Form,
	Input,
	Label,
	Link,
	Notify,
	SectionLabel,
	Select,
	View,
	theme,
} from '@vanilla-bean/components';
import { specFor } from 'ender-launcher/spec';

import { collection } from './collection';
import { loadListing, loadVersions } from './data';
import { GROUPS, instanceItems, modrinthNamed } from './instanceMods';
import { modrinthProjects } from './modrinthProjects';
import { heldBack, heldBuilds, lastSaid, local } from './local';
import { confirmHeldBuilds, listingButton } from './controls';
import { instanceNameOf, packDialog } from './packMaker';
import { packOrMods, readPasted } from './pasted';
import { playerChoice } from './playersPanel';
import { LOADERS } from './search';
import { Alarm, Chip, Command, LAUNCHER, Meta, Row, Stack, Title, Warning, avatar, siteBar, siteFooter } from './ui';

const INSTANCE_LOADERS = { ...LOADERS, vanilla: 'Vanilla' };

const told = (intent, content, options) => new Notify({ intent, content, ...options });

const checkbox = (label, checked, onChange) =>
	new Label({ label, variant: 'inline-after' }, new Input({ type: 'checkbox', value: checked, onChange }));

const STEP = /^:: (.+)$/;

const COUNTED = /^\s+(\S.*?)\s+(\d+)\/(\d+)\s*$/;

/**
 * Where a job is, from ender's lines: its latest step, the count it has printed since (a download's files), and
 * whether that step started the game, after which the lines are the game's own log.
 */
export const jobProgress = (lines = []) => {
	const at = lines.findLastIndex(line => STEP.test(line));
	const step = at === -1 ? undefined : lines[at].match(STEP)[1];
	const counted = lines
		.slice(at + 1)
		.map(line => line.match(COUNTED))
		.findLast(Boolean);

	return {
		step,
		playing: step?.startsWith('Launching ') ?? false,
		counted:
			counted && !step?.startsWith('Launching ')
				? { label: counted[1], done: Number(counted[2]), total: Number(counted[3]) }
				: undefined,
	};
};

export const jobLine = job => {
	if (job === undefined) return '';

	const { step, playing, counted } = jobProgress(job.lines);

	if (job.state === 'running' && playing)
		return `Playing ${step.replace(/^Launching /, '')}; closing the game ends this`;
	if (job.state === 'running' && step)
		return `${job.title}: ${step}${counted ? `, ${counted.label} ${counted.done} of ${counted.total}` : ''}`;
	if (job.state === 'running') return `${job.title}: ${lastSaid(job.lines) || 'starting'}`;
	if (job.state === 'done' && playing) return lastSaid(job.lines) || `${job.title}: done`;
	if (job.state === 'done') return `${job.title}: done`;

	const said = lastSaid(job.lines);

	return job.error ?? `${job.title} failed (ender exited ${job.code})${said ? `: ${said}` : ''}`;
};

const outputView = () =>
	new Command({
		multiline: true,
		language: 'plaintext',
		style: { display: 'none', maxHeight: '260px', overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 },
	});

const progressView = () => new Component({ tag: 'progress', style: { display: 'none', width: '100%' } });

/** A bar for the count a running job last printed, hidden when it has none. */
const showProgress = (view, job) => {
	const counted = job?.state === 'running' ? jobProgress(job.lines).counted : undefined;

	view.elem.style.display = counted ? '' : 'none';

	if (counted) {
		view.elem.max = counted.total;
		view.elem.value = counted.done;
	}
};

const showOutput = (view, job, open) => {
	view.elem.style.display = open && job ? 'block' : 'none';
	view.options.code = job?.lines.join('\n') ?? '';
	view.elem.scrollTop = view.elem.scrollHeight;
};

/** What each card had open, which outlives the card when the list is drawn again. */
const opened = new Map();

const openedFor = name => {
	if (!opened.has(name)) opened.set(name, { mods: false, output: false, updateFirst: true });

	return opened.get(name);
};

/** What an item's facts line says: what kind it is, the version installed or pinned, and where it comes from. */
const factsOf = item =>
	[
		item.kind === 'mod' ? undefined : item.kind,
		item.version && (item.pinned ? `pinned at ${item.version}` : item.version),
		!item.version && (item.optional && !item.optional.on ? 'left out' : 'not installed yet'),
		`from ${item.source}`,
	]
		.filter(Boolean)
		.join(' · ');

/** Beside an item: an optional one's state and the switch for it, and a way to remove one this instance declares. */
const itemControls = (item, { onDrop, onToggle }) => {
	if (item.optional) {
		const { on } = item.optional;

		return [
			new Chip({ addClass: on ? 'installed' : undefined, textContent: on ? 'on' : 'off' }),
			new Button({
				variant: 'flat',
				textContent: on ? 'Turn off' : 'Turn on',
				title: on ? 'Leave it out at the next sync' : 'Install it at the next sync',
				onPointerPress: () => onToggle(item.key, !on),
			}),
		];
	}

	if (item.group === 'dependency' || item.group === 'assets') return [];
	if (!item.spec) return [new Meta({ textContent: 'built or kept on this machine' })];

	return [
		new Button({
			icon: 'xmark',
			variant: 'flat',
			title: `Remove ${item.spec}`,
			onPointerPress: () => onDrop(item.spec),
		}),
	];
};

/** Something an instance installs, in a few lines: what it is and is about, its facts, where to read more, and its controls. */
const itemCard = (item, handlers) => {
	const { readMore } = item;
	const away = readMore?.away ? { target: '_blank', attributes: { rel: 'noopener noreferrer' } } : {};

	const controls = itemControls(item, handlers);

	// The controls sit beside the words where there is room and drop beneath them on a phone, so neither is squeezed
	return new Card(
		{},
		new Row({
			style: { alignItems: 'flex-start', gap: theme.space.md },
			append: [
				new Row({
					style: {
						flex: '1 1 260px',
						flexWrap: 'nowrap',
						alignItems: 'flex-start',
						gap: theme.space.md,
						minWidth: '0',
					},
					append: [
						avatar(item.picture, 40),
						new Stack({
							style: { flex: '1', minWidth: '0', gap: theme.space.xs },
							append: [
								new Title({ textContent: item.title }),
								...(item.about ? [new Meta({ textContent: item.about })] : []),
								new Meta({ textContent: factsOf(item) }),
								...(readMore ? [new Link({ href: readMore.href, textContent: readMore.label, ...away })] : []),
							],
						}),
					],
				}),
				...(controls.length > 0
					? [new Row({ style: { flex: 'none', marginLeft: 'auto', alignItems: 'center' }, append: controls })]
					: []),
			],
		}),
	);
};

/**
 * Everything an instance installs, grouped as GROUPS orders them and counted: what its pack brings, what was added to
 * it, what its pack offers as optional with each one's switch, its resource and shader packs, and what came in for what
 * the rest need. `listing` names and describes what the index has; without it, names come from what is installed.
 */
export const instanceList = (details, listing, handlers, published) => {
	const items = instanceItems(details, listing, published);

	return GROUPS.flatMap(group => {
		const found = items.filter(item => item.group === group.id);

		if (found.length === 0) return [];

		const label = group.id === 'own' && !details.pack ? 'Its mods' : group.label;

		return [
			new SectionLabel({ textContent: `${label} (${found.length})` }),
			...(group.note ? [new Meta({ textContent: group.note })] : []),
			...found.map(item => itemCard(item, handlers)),
		];
	});
};

/**
 * What a finished job that held jars back says beside its instance, in place of ender's own refusal: the offer below it
 * explains, and the output keeps every line ender printed. Undefined for any other job.
 */
const heldBackLine = job => {
	if (!job || job.state === 'running') return undefined;

	const count = heldBack(job).length;

	if (count > 0) return `${job.title} stopped: ender held back ${count === 1 ? 'a jar' : `${count} jars`}, as below`;
	if (heldBuilds(job).length > 0) return `${job.title} stopped: a mod's build scripts changed, as below`;

	return undefined;
};

/**
 * A source build held because its build scripts changed, beside the instance whose job it was: which changed, and the
 * one way past it, reading the diff and allowing them, which runs the job again.
 */
export const heldBuildOffer = (job, runJob) => [
	new Warning({
		append: [
			...heldBuilds(job).flatMap(build => [
				new Component({
					tag: 'strong',
					textContent: `${build.key}'s build scripts changed since you allowed building it.`,
				}),
				...build.changes.map(change => new Meta({ tag: 'div', textContent: change })),
			]),
			new Row({
				append: [
					new Button({
						variant: 'flat',
						textContent: 'See what changed',
						onPointerPress: async () => {
							if (await confirmHeldBuilds(job)) {
								runJob(() => local.allowBuildsAndRetry(job), {
									done: `${job.title}: done, with the new build scripts allowed`,
								});
							}
						},
					}),
				],
			}),
		],
	}),
];

/** Whatever a finished job held for the player to decide, with its way past. */
const heldOffer = (job, runJob) => {
	if (!job || job.state === 'running') return [];
	if (heldBack(job).length > 0) return trustOffer(job, runJob);
	if (heldBuilds(job).length > 0) return heldBuildOffer(job, runJob);

	return [];
};

/**
 * What a sync held back for naming where other programs keep logins, beside the instance whose job it was, with the
 * one way past it: trusting those jars by their hashes, asked twice so it is never a slip, and running the job again.
 */
export const trustOffer = (job, runJob) => {
	const confirm = new Button({
		variant: 'flat',
		textContent: 'I trust it: install anyway',
		style: { display: 'none' },
		onPointerPress: () =>
			runJob(() => local.trustAndRetry(job), { done: `${job.title}: done, trusting what was held back` }),
	});
	const first = new Button({
		variant: 'flat',
		textContent: 'Install it anyway',
		onPointerPress: () => {
			first.elem.style.display = 'none';
			confirm.elem.style.display = '';
		},
	});

	return [
		new Alarm({
			append: [
				new Component({
					tag: 'strong',
					textContent: `ender held back ${heldBack(job).length === 1 ? 'a jar' : `${heldBack(job).length} jars`} whose code names where other programs keep logins, such as Discord's token or a browser's saved passwords. No mod has a reason to.`,
				}),
				new Meta({
					tag: 'div',
					textContent:
						'Install it only if you are sure of where it came from. Trusting it allows this jar alone, by its hash.',
				}),
				new Row({ append: [first, confirm] }),
			],
		}),
	];
};

const instanceCard = (instance, signal) => {
	const open = openedFor(instance.name);
	const status = new Meta();
	const trusting = new Stack();
	const bar = progressView();
	const output = outputView();
	const mods = new Stack({ style: { display: open.mods ? '' : 'none', gap: theme.space.xs } });
	const actions = [];
	const action = options => {
		const button = new Button(options);

		actions.push(button);

		return button;
	};
	const showJob = () => {
		const job = local.jobFor(instance.name);
		const working = job?.state === 'running';

		for (const button of actions) button.options.disabled = working;

		status.elem.textContent = heldBackLine(job) ?? jobLine(job);
		trusting.content(heldOffer(job, (...args) => runJob(...args)));
		showProgress(bar, job);
		showOutput(output, job, open.output);
	};
	// A job can finish minutes after its press, so what it says goes beside this instance's card
	const runJob = async (starting, { done, quietWhenDone = false } = {}) => {
		try {
			const job = await starting();

			showJob();
			await local.finished(job, { reloading: !quietWhenDone });

			if (!quietWhenDone) told('success', done ?? `${job.title}: done`, { anchor: card });
		} catch (error) {
			told(error.trusted ? 'info' : 'danger', `${instance.name}: ${error.message}`, {
				anchor: card,
				...(error.trusted ? { timeout: 0 } : {}),
			});
		}
	};
	const showMods = async () => {
		mods.content(new EmptyState({ loading: true, title: 'Reading its mods' }));

		try {
			const details = await local.details(instance.name);
			const handlers = {
				onToggle: (key, on) =>
					runJob(() => local.setOptional(instance.name, key, on), {
						done: `${on ? 'Turned on' : 'Turned off'} ${key}`,
					}).then(showMods),
				onDrop: spec => runJob(() => local.dropFrom(instance.name, [spec]), { done: `Removed ${spec}` }).then(showMods),
			};
			// Drawn at once from what ender says, then again as the listing names and describes what the index has and
			// Modrinth what it publishes
			const known = { listing: [], published: new Map() };
			const draw = () => {
				const listed = instanceList(details, known.listing, handlers, known.published);

				mods.content(
					listed.length > 0
						? listed
						: new EmptyState({
								icon: 'puzzle-piece',
								title: 'No mods chosen yet',
								message: 'Add them from the Mods page',
							}),
				);
			};

			draw();
			loadListing()
				.then(listing => {
					known.listing = listing;
					if (!signal.aborted && open.mods) draw();
				})
				.catch(() => {});
			modrinthProjects(modrinthNamed(details))
				.then(published => {
					known.published = published;
					if (!signal.aborted && open.mods) draw();
				})
				.catch(() => {});
		} catch (error) {
			mods.content(
				new EmptyState({
					icon: 'triangle-exclamation',
					title: 'Its mods did not load',
					message: error.message,
					action: { textContent: 'Try again', onPointerPress: () => showMods() },
				}),
			);
		}
	};
	const publish = async fresh => {
		let published;

		status.elem.textContent = 'Publishing its chosen mods as a secret gist';

		try {
			const { url, line, updated, left = [] } = await local.publishInstance(instance.name, { fresh });

			published = url;
			told(
				'success',
				`${updated ? 'Updated' : 'Published'} at ${url}; ${line} installs it anywhere${left.length > 0 ? `. Left out, as only this machine has them: ${left.join(', ')}` : ''}`,
			);
		} catch (error) {
			told('danger', `${instance.name} was not published: ${error.message}`);
		} finally {
			showJob();
		}

		if (published === undefined) return;

		await local.loadAccount();
		status.content([`Published at ${published} `, ...listingButton(published)]);
	};
	const client = instance.type === 'client';
	const modsToggle = new Button({
		icon: 'chevron-down',
		variant: 'flat',
		textContent: open.mods ? 'Hide mods' : 'Show mods',
		onPointerPress: () => {
			open.mods = !open.mods;
			mods.elem.style.display = open.mods ? '' : 'none';
			modsToggle.options.textContent = open.mods ? 'Hide mods' : 'Show mods';
			if (open.mods) showMods();
		},
	});
	const outputToggle = new Button({
		icon: 'terminal',
		variant: 'flat',
		textContent: open.output ? 'Hide output' : 'Show output',
		title: 'What ender printed for the last job here',
		onPointerPress: () => {
			open.output = !open.output;
			outputToggle.options.textContent = open.output ? 'Hide output' : 'Show output';
			showJob();
		},
	});

	if (open.mods) showMods();
	local.watchJobs(showJob, signal);

	const card = new Card(
		{},
		new Stack({
			style: { gap: theme.space.sm },
			append: [
				new Row({
					append: [
						new Title({ textContent: instance.name }),
						...(instance.active ? [new Chip({ textContent: 'active' })] : []),
						new Meta({
							textContent: [
								instance.type,
								`Minecraft ${instance.minecraft}`,
								INSTANCE_LOADERS[instance.loader?.type] ?? instance.loader?.type,
							]
								.filter(Boolean)
								.join(' · '),
						}),
					],
				}),
				new Row({
					append: [
						...(client
							? [
									action({
										icon: 'play',
										textContent: 'Launch',
										onPointerPress: () =>
											runJob(() => local.launch(instance.name, { update: open.updateFirst }), {
												quietWhenDone: true,
											}),
									}),
									checkbox('update first', open.updateFirst, ({ target: { checked } }) => {
										open.updateFirst = checked;
									}),
									...playerChoice(instance),
								]
							: []),
						action({
							icon: 'rotate',
							variant: 'flat',
							textContent: 'Update',
							onPointerPress: () => runJob(() => local.update(instance.name)),
						}),
						modsToggle,
						outputToggle,
						action({
							icon: 'share',
							variant: 'flat',
							textContent: 'Publish as gist',
							title: 'Publish its chosen mods; publishing again updates the same gist',
							onPointerPress: () => publish(false),
						}),
						action({
							icon: 'trash',
							variant: 'flat',
							textContent: 'Delete',
							onPointerPress: async () => {
								if (
									await Dialog.confirm({
										header: `Delete ${instance.name}?`,
										body: "ender forgets the instance. Its game directory, worlds included, is kept: moved into kept/ in ender's data directory if it is inside the instance.",
										confirmLabel: 'Delete',
										intent: 'danger',
									})
								)
									runJob(() => local.remove(instance.name));
							},
						}),
					],
				}),
				status,
				trusting,
				bar,
				output,
				mods,
			],
		}),
	);

	showJob();

	return card;
};

/** Runs a job whose word goes on `status`, and answers whether it finished. */
const runInto = async (status, starting, trusting) => {
	status.elem.textContent = 'Asking ender';
	trusting?.content([]);

	const controller = new AbortController();

	try {
		const job = await starting();
		const show = () => {
			status.elem.textContent = jobLine(job);
		};

		show();
		local.watchJobs(show, controller.signal);
		await local.finished(job);
		// Long after the press: beside the status line it is about
		told('success', `${job.title}: done`, { anchor: status });

		return true;
	} catch (error) {
		status.elem.textContent =
			(error.trusted ? error.message : heldBackLine(error.job)) ?? `It did not work: ${error.message}`;
		trusting?.content([]);

		if (trusting) trusting.content(heldOffer(error.job, again => runInto(status, again, trusting)));
		if (!status.elem.isConnected) told('danger', status.elem.textContent, { timeout: 0 });

		return false;
	} finally {
		controller.abort();
	}
};

/** What is wrong with the mods listed for a new instance, or nothing: a pack goes in From a pack, and each line is a mod. */
const listProblem = text => {
	const { packs, unread } = readPasted(String(text ?? ''), { bare: 'mod' });

	if (packs.length > 0) return `${packs.join(', ')} is a pack; it goes in From a pack above`;
	if (unread.length > 0) return `Not a mod ender can read: ${unread.join(' ')}`;

	return undefined;
};

/** The way to a new instance, from a pack or a list, in a dialog that closes once ender has made it. */
const newInstanceDialog = pageSignal => {
	const lifetime = new AbortController();
	const signal = lifetime.signal;
	const status = new Meta({ style: { whiteSpace: 'pre-wrap' } });
	const trusting = new Stack();
	// Why what was pasted is not one pack to import, shown on the field until what is in it changes
	let refused;
	const source = new Input({
		placeholder: "A pack's index page or ender import line, a gist link, gh:owner/repo, or an https link to a pack",
		style: { flex: '1' },
		validate: value => (refused && String(value ?? '') === refused.text ? refused.message : undefined),
	});
	const form = new Form({
		data: {
			name: '',
			minecraft: '',
			loader: 'fabric',
			collected: collection.items.length,
			withCollected: true,
			specs: '',
		},
		inputs: [
			{
				type: 'group',
				style: { display: 'flex', flexWrap: 'wrap', gap: theme.space.sm },
				inputs: [
					{
						key: 'name',
						placeholder: 'Its name',
						validate: value => (String(value ?? '').trim() ? undefined : 'Give it a name first'),
					},
					{
						key: 'minecraft',
						InputComponent: Select,
						options: [{ label: 'The newest release', value: '' }],
					},
					{
						key: 'loader',
						InputComponent: Select,
						options: Object.entries(INSTANCE_LOADERS).map(([value, label]) => ({ label, value })),
					},
				],
			},
			{
				key: 'withCollected',
				label: 'With the mods collected',
				type: 'checkbox',
				condition: data => data.collected > 0,
			},
			{
				key: 'specs',
				label: 'More mods',
				tag: 'textarea',
				placeholder: 'Their index pages, ender add lines, gh:owner/repo or mr:sodium, as many as you like',
				attributes: { rows: 3 },
				validate: listProblem,
			},
		],
	});

	const importPasted = () => {
		const text = String(source.options.value ?? '');
		const { pack, mods, said } = packOrMods(text);

		refused = pack || mods ? undefined : { text, message: said };
		source.validate();

		if (pack) {
			runInto(status, () => local.importPack(pack), trusting).then(made => made && dialog.close());

			return;
		}

		// Mods are moved to the list below, which is said beside the actions: not a problem with the field
		if (mods) {
			const listed = String(form.options.data.specs ?? '').trim();

			form.options.data.specs = [listed, ...mods].filter(Boolean).join('\n');
			source.options.value = '';
			status.elem.textContent = said;
		}
	};

	const make = () => {
		if (form.hasErrors()) return;

		const { name, minecraft, loader, withCollected, specs } = form.options.data;
		const listed = [
			...(withCollected ? collection.items.map(item => specFor(item.host ?? 'github', item.repo)) : []),
			...readPasted(String(specs ?? ''), { bare: 'mod' }).mods,
		];

		runInto(
			status,
			() =>
				local.create({
					name: instanceNameOf(name),
					...(minecraft ? { minecraft } : {}),
					loader,
					specs: [...new Set(listed)],
				}),
			trusting,
		).then(made => made && dialog.close());
	};

	const packOfCollected = new Component({ tag: 'span' });
	const drawCollected = items => {
		form.options.data.collected = items.length;
		packOfCollected.content(
			items.length > 0
				? new Button({
						icon: 'share',
						variant: 'flat',
						textContent: 'Make a pack of the collected mods',
						onPointerPress: () => packDialog(collection.items),
					})
				: [],
		);
	};

	drawCollected(collection.items);
	collection.subscribe(drawCollected, signal);

	loadVersions()
		.then(versions => {
			form.inputElements.minecraft.options.options = [{ label: 'The newest release', value: '' }, ...versions];
		})
		.catch(() => {});

	const closeWithPage = () => dialog.close();

	pageSignal.addEventListener('abort', closeWithPage, { once: true });

	const dialog = new Dialog({
		header: 'New instance',
		size: 'fit',
		onClose: () => {
			lifetime.abort();
			pageSignal.removeEventListener('abort', closeWithPage);
		},
		body: new Stack({
			style: { gap: theme.space.md },
			append: [
				new Label(
					{ label: 'From a pack', for: source },
					new Row({
						append: [
							source,
							new Button({
								icon: 'download',
								textContent: 'Import',
								onPointerPress: () => importPasted(),
							}),
						],
					}),
				),
				new SectionLabel({ level: 3, textContent: 'From a list' }),
				form,
				packOfCollected,
				status,
				trusting,
			],
		}),
		footer: [
			new Button({ variant: 'flat', textContent: 'Close', onPointerPress: () => dialog.close() }),
			new Button({ icon: 'plus', textContent: 'Make it', onPointerPress: make }),
		],
	});

	return dialog;
};

export default class InstancesPage extends View {
	build() {
		document.title = 'Instances :: ender index';

		const body = new Stack({ append: new EmptyState({ loading: true, title: 'Asking ender for its instances' }) });

		this.content([
			siteBar('instances'),
			new Content({ column: 900, style: { paddingBlock: theme.space.md }, append: [body, siteFooter()] }),
		]);

		const list = new Stack();
		let drawn;
		let cards;
		/** Drawn again only when the instances change, so a card keeps what it shows while its job runs. */
		const drawList = () => {
			const shape = JSON.stringify([local.error, local.all, local.players?.accounts]);

			if (shape === drawn) return;

			drawn = shape;
			cards?.abort();
			cards = new AbortController();
			if (local.error)
				list.content(
					new EmptyState({
						icon: 'triangle-exclamation',
						title: 'The instances did not load',
						message: local.error,
						action: { textContent: 'Try again', onPointerPress: () => local.reload() },
					}),
				);
			else if (local.all.length === 0)
				list.content(
					new EmptyState({
						icon: 'cube',
						title: 'No instances yet',
						message: 'Make one with New instance, from a pack or a list',
					}),
				);
			else list.content(local.all.map(instance => instanceCard(instance, cards.signal)));
		};

		this.signal.addEventListener('abort', () => cards?.abort());

		local.ready().then(served => {
			if (this.signal.aborted) return;

			if (!served) {
				body.content(
					new EmptyState({
						icon: 'laptop',
						title: 'Instances live on your own machine',
						message: 'Run ender web, and this page manages the instances there',
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

			body.content([
				new Row({
					append: new Button({
						icon: 'plus',
						textContent: 'New instance',
						onPointerPress: () => newInstanceDialog(this.signal),
					}),
				}),
				list,
			]);
			local.loadPlayers();
			drawList();
			local.subscribe(drawList, this.signal);
		});
	}
}
