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
import { loadVersions } from './data';
import { heldBack, lastSaid, local } from './local';
import { listingButton } from './controls';
import { instanceNameOf, packDialog } from './packMaker';
import { packOrMods, readPasted } from './pasted';
import { playerChoice } from './playersPanel';
import { LOADERS } from './search';
import { Alarm, Chip, Command, LAUNCHER, Meta, Row, Stack, Title, siteBar } from './ui';

const NAMEABLE_SOURCES = new Set(['github', 'codeberg', 'gitlab', 'modrinth', 'curseforge']);

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

const modList = (manifest, onDrop) =>
	(manifest.mods ?? []).map(mod => {
		const shareable = NAMEABLE_SOURCES.has(mod.source);
		const spec = shareable ? specFor(mod.source, mod.id) : undefined;
		const shown = manifest.installed?.find(found => found.key === `${mod.source}:${mod.id ?? mod.path ?? mod.url}`);

		return new Row({
			append: [
				new Chip({ textContent: shown?.name ?? spec ?? mod.path ?? mod.url ?? mod.id }),
				...(mod.version ? [new Meta({ textContent: `pinned at ${mod.version}` })] : []),
				...(shareable
					? [
							new Button({
								icon: 'xmark',
								variant: 'flat',
								title: `Remove ${spec}`,
								onPointerPress: () => onDrop(spec),
							}),
						]
					: [new Meta({ textContent: 'built or kept on this machine' })]),
			],
		});
	});

/**
 * What a finished job that held jars back says beside its instance, in place of ender's own refusal: the offer below it
 * explains, and the output keeps every line ender printed. Undefined for any other job.
 */
const heldBackLine = job => {
	const count = job && job.state !== 'running' ? heldBack(job).length : 0;

	return count > 0
		? `${job.title} stopped: ender held back ${count === 1 ? 'a jar' : `${count} jars`}, as below`
		: undefined;
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
		trusting.content(
			job && job.state !== 'running' && heldBack(job).length > 0 ? trustOffer(job, (...args) => runJob(...args)) : [],
		);
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
			const manifest = await local.details(instance.name);

			mods.content(
				(manifest.mods ?? []).length === 0
					? new EmptyState({
							icon: 'puzzle-piece',
							title: 'No mods chosen yet',
							message: 'Add them from the Mods page',
						})
					: modList(manifest, spec =>
							runJob(() => local.dropFrom(instance.name, [spec]), { done: `Removed ${spec}` }).then(showMods),
						),
			);
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
	} catch (error) {
		status.elem.textContent =
			(error.trusted ? error.message : heldBackLine(error.job)) ?? `It did not work: ${error.message}`;
		trusting?.content([]);

		if (trusting && heldBack(error.job).length > 0)
			trusting.content(trustOffer(error.job, again => runInto(status, again, trusting)));
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

const newInstance = signal => {
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
			runInto(status, () => local.importPack(pack), trusting);

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
		);
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

	return new Card(
		{},
		new Stack({
			style: { gap: theme.space.md },
			append: [
				new SectionLabel({ level: 2, textContent: 'New instance' }),
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
				new Row({
					append: [new Button({ icon: 'plus', textContent: 'Make it', onPointerPress: make }), packOfCollected],
				}),
				status,
				trusting,
			],
		}),
	);
};

export default class InstancesPage extends View {
	build() {
		document.title = 'Instances :: ender index';

		const body = new Stack({ append: new EmptyState({ loading: true, title: 'Asking ender for its instances' }) });

		this.content([
			siteBar('instances'),
			new Content({ column: 900, style: { paddingBlock: theme.space.md }, append: body }),
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
					new EmptyState({ icon: 'cube', title: 'No instances yet', message: 'Make one above, from a pack or a list' }),
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

			body.content([newInstance(this.signal), list]);
			local.loadPlayers();
			drawList();
			local.subscribe(drawList, this.signal);
		});
	}
}
