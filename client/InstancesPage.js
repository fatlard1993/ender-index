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
import { local } from './local';
import { instanceNameOf, packDialog } from './packMaker';
import { LOADERS } from './search';
import { Chip, Command, LAUNCHER, Meta, Row, Stack, Title, siteBar } from './ui';

const SHAREABLE = new Set(['github', 'codeberg', 'gitlab', 'modrinth', 'curseforge']);

const PACK_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge', 'vanilla'];

/** What ender said last, shortened to what a toast can hold. */
const tail = text => (text.length > 300 ? `…${text.slice(-300)}` : text);

/** ender's own verdict on what it did, its last ok, !! or xx line, rather than every step it printed on the way. */
export const summaryOf = output => {
	const lines = (output ?? '')
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);
	const verdicts = lines.filter(line => /^(ok|!!|xx) /.test(line));

	return tail((verdicts.at(-1) ?? lines.at(-1) ?? 'Done').replace(/^(ok|!!|xx) /, ''));
};

/** A checkbox with its words beside it, as small as the buttons it sits among. */
const checkbox = (text, checked, onChange) =>
	new Component({
		tag: 'label',
		style: { display: 'inline-flex', alignItems: 'center', gap: theme.space.xs, cursor: 'pointer' },
		append: [
			new Component({ tag: 'input', attributes: { type: 'checkbox', ...(checked ? { checked: '' } : {}) }, onChange }),
			text,
		],
	});

const told = (intent, content) => new Notify({ intent, content });

/** The mods an instance chose, each removable when the page may name it, which a jar on disk or a build is not. */
const modList = (manifest, onDrop) =>
	(manifest.mods ?? []).map(mod => {
		const shareable = SHAREABLE.has(mod.source);
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

/** One instance: what it is, and what can be done with it from here. */
const instanceCard = instance => {
	const busy = new Meta();
	const mods = new Stack({ style: { display: 'none', gap: theme.space.xs } });
	let updateFirst = true;
	const working = async (doing, work, done) => {
		busy.elem.textContent = doing;

		try {
			const result = await work();

			if (done) told('success', done(result));
		} catch (error) {
			told('danger', `${instance.name}: ${summaryOf(error.message)}`);
		} finally {
			busy.elem.textContent = '';
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
							working(
								`Removing ${spec}`,
								() => local.dropFrom(instance.name, [spec]),
								() => `Removed ${spec}`,
							).then(showMods),
						),
			);
		} catch (error) {
			mods.content(new Meta({ textContent: `Its mods did not load: ${error.message}` }));
		}
	};
	const client = instance.type === 'client';

	return new Card(
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
								LOADERS[instance.loader?.type] ?? instance.loader?.type,
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
									new Button({
										icon: 'play',
										textContent: 'Launch',
										onPointerPress: () =>
											working(
												'Starting it',
												() => local.launch(instance.name, { update: updateFirst }),
												({ log }) => `Launching ${instance.name}; the game window opens when it is ready (log: ${log})`,
											),
									}),
									checkbox('update first', updateFirst, ({ target: { checked } }) => {
										updateFirst = checked;
									}),
								]
							: []),
						new Button({
							icon: 'rotate',
							variant: 'flat',
							textContent: 'Update',
							onPointerPress: () =>
								working(
									'Updating; ender fetches what changed',
									() => local.update(instance.name),
									() => `Updated ${instance.name}`,
								),
						}),
						new Button({
							icon: 'chevron-down',
							variant: 'flat',
							textContent: 'Mods',
							onPointerPress: () => {
								const opening = mods.elem.style.display === 'none';

								mods.elem.style.display = opening ? '' : 'none';
								if (opening) showMods();
							},
						}),
						new Button({
							icon: 'share',
							variant: 'flat',
							textContent: 'Publish as gist',
							onPointerPress: () =>
								working(
									'Publishing its chosen mods as a secret gist',
									() => local.publishInstance(instance.name),
									({ url, line }) => `Published at ${url}; ${line} installs it anywhere`,
								),
						}),
						new Button({
							icon: 'trash',
							variant: 'flat',
							textContent: 'Delete',
							onPointerPress: async () => {
								if (
									await Dialog.confirm({
										header: `Delete ${instance.name}?`,
										body: 'ender forgets the instance. Its game directory, with its worlds, stays on disk.',
										confirmLabel: 'Delete',
										intent: 'danger',
									})
								)
									working(
										'Deleting it',
										() => local.remove(instance.name),
										() => `Deleted ${instance.name}`,
									);
							},
						}),
						busy,
					],
				}),
				mods,
			],
		}),
	);
};

/** Make an instance from a pack anyone can point at, or from a list: the mods collected, and any named by spec. */
const newInstance = () => {
	const status = new Meta();
	const source = new Input({
		placeholder: 'A gist link, gh:owner/repo, or an https link to a pack',
		style: { flex: '1' },
	});
	const choice = { name: '', minecraft: '', loader: 'fabric', withCollected: collection.items.length > 0 };
	const minecraft = new Select({
		options: [{ label: 'The newest release', value: '' }],
		value: '',
		onChange: ({ target: { value } }) => {
			choice.minecraft = value;
		},
	});
	const specs = new Input({
		tag: 'textarea',
		placeholder: 'More mods, one to a line, as search writes them: gh:owner/repo, mr:sodium',
		attributes: { rows: 3 },
	});
	const run = async (doing, work) => {
		status.elem.textContent = doing;

		try {
			const { output } = await work();

			status.elem.textContent = '';
			told('success', summaryOf(output));
		} catch (error) {
			status.elem.textContent = `It did not work: ${summaryOf(error.message)}`;
		}
	};

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
								onPointerPress: () =>
									run('Importing; ender fetches the pack and what it names', () =>
										local.importPack(source.elem.value.trim()),
									),
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
										options: PACK_LOADERS.map(value => ({ label: LOADERS[value] ?? value, value })),
										value: choice.loader,
										onChange: ({ target: { value } }) => {
											choice.loader = value;
										},
									}),
								],
							}),
							...(collection.items.length > 0
								? [
										checkbox(
											`with the ${collection.items.length} mods collected`,
											choice.withCollected,
											({ target: { checked } }) => {
												choice.withCollected = checked;
											},
										),
									]
								: []),
							specs,
							new Row({
								append: [
									new Button({
										icon: 'plus',
										textContent: 'Make it',
										onPointerPress: () => {
											const wanted = instanceNameOf(choice.name || 'instance');
											const listed = [
												...(choice.withCollected
													? collection.items.map(item => specFor(item.host ?? 'github', item.repo))
													: []),
												...specs.elem.value
													.split('\n')
													.map(line => line.trim())
													.filter(Boolean),
											];

											run(`Making ${wanted}; ender fetches the game and the mods, which takes a while`, () =>
												local.create({
													name: wanted,
													...(choice.minecraft ? { minecraft: choice.minecraft } : {}),
													loader: choice.loader,
													specs: [...new Set(listed)],
												}),
											);
										},
									}),
									...(collection.items.length > 0
										? [
												new Button({
													icon: 'share',
													variant: 'flat',
													textContent: 'Make a pack of the collected mods',
													onPointerPress: () => packDialog(collection.items),
												}),
											]
										: []),
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
		const drawList = () =>
			list.content(
				local.all.length === 0
					? new Meta({ tag: 'p', textContent: 'No instances yet: make one above.' })
					: local.all.map(instanceCard),
			);

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

			body.content([new Title({ tag: 'h1', textContent: 'Instances' }), newInstance(), list]);
			drawList();
			local.subscribe(drawList, this.signal);
		});
	}
}
