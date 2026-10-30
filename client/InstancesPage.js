import {
	Button,
	Card,
	Component,
	Content,
	Dialog,
	EmptyState,
	Input,
	Label,
	Link,
	Notify,
	Select,
	View,
	theme,
} from '@vanilla-bean/components';
import { specFor } from 'ender-launcher/spec';

import { collection } from './collection';
import { loadVersions } from './data';
import { lastSaid, local } from './local';
import { listingButton } from './controls';
import { instanceNameOf, packDialog } from './packMaker';
import { LOADERS } from './search';
import { Chip, Command, LAUNCHER, Meta, Row, Stack, Title, Warning, siteBar } from './ui';

const NAMEABLE_SOURCES = new Set(['github', 'codeberg', 'gitlab', 'modrinth', 'curseforge']);

const INSTANCE_LOADERS = { ...LOADERS, vanilla: 'Vanilla' };

const told = (intent, content) => new Notify({ intent, content });

const checkbox = (text, checked, onChange) =>
	new Component({
		tag: 'label',
		style: { display: 'inline-flex', alignItems: 'center', gap: theme.space.xs, cursor: 'pointer' },
		append: [
			new Component({ tag: 'input', attributes: { type: 'checkbox', ...(checked ? { checked: '' } : {}) }, onChange }),
			text,
		],
	});

export const jobLine = job => {
	if (job === undefined) return '';
	if (job.state === 'running') return `${job.title}: ${lastSaid(job.lines) || 'starting'}`;
	if (job.state === 'done') return `${job.title}: done`;

	const said = lastSaid(job.lines);

	return job.error ?? `${job.title} failed (ender exited ${job.code})${said ? `: ${said}` : ''}`;
};

const outputView = () =>
	new Command({
		tag: 'pre',
		style: { display: 'none', maxHeight: '260px', overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 },
	});

const showOutput = (view, job, open) => {
	view.elem.style.display = open && job ? '' : 'none';
	view.elem.textContent = job?.lines.join('\n') ?? '';
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

const instanceCard = (instance, signal) => {
	const open = openedFor(instance.name);
	const status = new Meta();
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

		for (const button of actions) button.elem.disabled = working;

		status.elem.textContent = jobLine(job);
		showOutput(output, job, open.output);
	};
	const runJob = async (starting, { done, quietWhenDone = false } = {}) => {
		try {
			const job = await starting();

			showJob();
			await local.finished(job, { reloading: !quietWhenDone });

			if (!quietWhenDone) told('success', done ?? `${job.title}: done`);
		} catch (error) {
			told('danger', `${instance.name}: ${error.message}`);
		}
	};
	const showMods = async () => {
		mods.content(new Meta({ textContent: 'Reading its mods' }));

		try {
			const manifest = await local.details(instance.name);

			mods.content(
				(manifest.mods ?? []).length === 0
					? new Meta({ textContent: 'No mods chosen yet: add them from the Mods page' })
					: modList(manifest, spec =>
							runJob(() => local.dropFrom(instance.name, [spec]), { done: `Removed ${spec}` }).then(showMods),
						),
			);
		} catch (error) {
			mods.content(new Meta({ textContent: `Its mods did not load: ${error.message}` }));
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
								]
							: []),
						action({
							icon: 'rotate',
							variant: 'flat',
							textContent: 'Update',
							onPointerPress: () => runJob(() => local.update(instance.name)),
						}),
						new Button({
							icon: 'chevron-down',
							variant: 'flat',
							textContent: 'Mods',
							onPointerPress: () => {
								open.mods = !open.mods;
								mods.elem.style.display = open.mods ? '' : 'none';
								if (open.mods) showMods();
							},
						}),
						new Button({
							icon: 'terminal',
							variant: 'flat',
							textContent: 'Output',
							title: 'What ender printed for the last job here',
							onPointerPress: () => {
								open.output = !open.output;
								showJob();
							},
						}),
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
				output,
				mods,
			],
		}),
	);

	showJob();

	return card;
};

const runInto = async (status, starting) => {
	status.elem.textContent = 'Asking ender';

	const controller = new AbortController();

	try {
		const job = await starting();
		const show = () => {
			status.elem.textContent = jobLine(job);
		};

		show();
		local.watchJobs(show, controller.signal);
		await local.finished(job);
		told('success', `${job.title}: done`);
	} catch (error) {
		status.elem.textContent = `It did not work: ${error.message}`;
	} finally {
		controller.abort();
	}
};

const newInstance = signal => {
	const status = new Meta({ style: { whiteSpace: 'pre-wrap' } });
	const source = new Input({
		placeholder: 'A gist link, gh:owner/repo, or an https link to a pack',
		style: { flex: '1' },
	});
	const choice = { name: '', minecraft: '', loader: 'fabric', withCollected: false };
	const minecraft = new Select({
		options: [{ label: 'The newest release', value: '' }],
		value: '',
		onChange: ({ target: { value } }) => {
			choice.minecraft = value;
		},
	});
	const specs = new Input({
		tag: 'textarea',
		placeholder: 'More mods, one to a line: gh:owner/repo, mr:sodium',
		attributes: { rows: 3 },
	});

	const withCollected = new Component({ tag: 'span' });
	const packOfCollected = new Component({ tag: 'span' });
	const drawCollected = items => {
		choice.withCollected = items.length > 0 && (choice.withCollected || withCollected.elem.childElementCount === 0);
		withCollected.content(
			items.length > 0
				? checkbox(`with the ${items.length} mods collected`, choice.withCollected, ({ target: { checked } }) => {
						choice.withCollected = checked;
					})
				: [],
		);
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
			minecraft.options.options = [{ label: 'The newest release', value: '' }, ...versions];
		})
		.catch(() => {});

	return new Card(
		{},
		new Stack({
			style: { gap: theme.space.md },
			append: [
				new Title({ textContent: 'New instance' }),
				new Label({
					label: 'From a pack',
					append: new Row({
						append: [
							source,
							new Button({
								icon: 'download',
								textContent: 'Import',
								onPointerPress: () => runInto(status, () => local.importPack(source.elem.value.trim())),
							}),
						],
					}),
				}),
				new Label({
					label: 'From a list',
					append: new Stack({
						append: [
							new Row({
								append: [
									new Input({
										placeholder: 'Its name',
										onInput: ({ target: { value } }) => {
											choice.name = value;
										},
									}),
									minecraft,
									new Select({
										options: Object.entries(INSTANCE_LOADERS).map(([value, label]) => ({ label, value })),
										value: choice.loader,
										onChange: ({ target: { value } }) => {
											choice.loader = value;
										},
									}),
								],
							}),
							withCollected,
							specs,
							new Row({
								append: [
									new Button({
										icon: 'plus',
										textContent: 'Make it',
										onPointerPress: () => {
											if (!choice.name.trim()) {
												status.elem.textContent = 'Give it a name first';

												return;
											}

											const listed = [
												...(choice.withCollected
													? collection.items.map(item => specFor(item.host ?? 'github', item.repo))
													: []),
												...specs.elem.value
													.split('\n')
													.map(line => line.trim())
													.filter(Boolean),
											];

											runInto(status, () =>
												local.create({
													name: instanceNameOf(choice.name),
													...(choice.minecraft ? { minecraft: choice.minecraft } : {}),
													loader: choice.loader,
													specs: [...new Set(listed)],
												}),
											);
										},
									}),
									packOfCollected,
								],
							}),
						],
					}),
				}),
				status,
			],
		}),
	);
};

export default class InstancesPage extends View {
	build() {
		document.title = 'Instances :: ender index';

		const body = new Stack({ append: new EmptyState({ loading: true, title: 'Asking ender for its instances' }) });

		this.content([siteBar('instances'), new Content({ column: 900, style: { paddingBlock: '12px' }, append: body })]);

		const list = new Stack();
		let drawn;
		let cards;
		/** Drawn again only when the instances change, so a card keeps what it shows while its job runs. */
		const drawList = () => {
			const shape = JSON.stringify([local.error, local.all]);

			if (shape === drawn) return;

			drawn = shape;
			cards?.abort();
			cards = new AbortController();
			if (local.error) list.content(new Warning({ textContent: local.error }));
			else if (local.all.length === 0)
				list.content(new Meta({ tag: 'p', textContent: 'No instances yet: make one above.' }));
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
								new Command({ tag: 'code', textContent: 'ender web' }),
								new Link({ href: LAUNCHER, textContent: 'Get ender' }),
							],
						}),
					}),
				);

				return;
			}

			body.content([new Title({ tag: 'h1', textContent: 'Instances' }), newInstance(this.signal), list]);
			drawList();
			local.subscribe(drawList, this.signal);
		});
	}
}
