import { Button, Dialog, Input, Label, Link, Notify, Select, copyToClipboard } from '@vanilla-bean/components';
import { specFor } from 'ender-launcher/spec';

import { loadVersions } from './data';
import { local } from './local';
import { LOADERS, readQuery } from './search';
import { Command, Meta, Row, Stack } from './ui';

const PACK_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

/** An ender pack of these mods: what each was chosen as, for ender to resolve what they need where it is installed. */
export const packOf = ({ name, minecraft, loader, items }) => ({
	name,
	minecraft,
	loader,
	mods: items.map(item => specFor(item.host ?? 'github', item.repo)),
});

/** A pack's name as an instance name: what ender takes, without spaces or anything a path could use. */
export const instanceNameOf = name =>
	name
		.trim()
		.toLowerCase()
		.replaceAll(/[^\w-]+/g, '-')
		.replaceAll(/^-+|-+$/g, '')
		.slice(0, 60) || 'pack';

const textOf = pack => `${JSON.stringify(pack, null, '\t')}\n`;

const download = pack => {
	const link = Object.assign(document.createElement('a'), {
		href: URL.createObjectURL(new Blob([textOf(pack)], { type: 'application/json' })),
		download: 'ender.pack.json',
	});

	link.click();
	URL.revokeObjectURL(link.href);
};

/**
 * Where a published pack is, and the line that installs it. On this machine ender publishes it as a secret gist under
 * its own GitHub account; the hosted page holds no account, so it copies the pack and opens GitHub's new gist page.
 */
const publish = async (pack, result) => {
	if (await local.ready()) {
		result.content(new Meta({ textContent: 'Publishing it as a secret gist' }));

		try {
			const { url, line } = await local.publishPack(pack);

			result.content([
				new Row({
					append: [
						new Meta({ textContent: 'Published at' }),
						new Link({ href: url, target: '_blank', textContent: url }),
					],
				}),
				new Row({
					append: [new Command({ tag: 'code', textContent: line }), new Meta({ textContent: 'installs it anywhere' })],
				}),
			]);
		} catch (error) {
			result.content(new Meta({ textContent: `It was not published: ${error.message}` }));
		}

		return;
	}

	const copied = await copyToClipboard(textOf(pack));

	window.open('https://gist.github.com/', '_blank', 'noopener');
	result.content(
		new Meta({
			tag: 'p',
			textContent: copied
				? 'The pack is copied. In the gist page that opened, name the file ender.pack.json, paste it, and create a secret gist; then anyone can install it with ender import and the gist link.'
				: 'The clipboard is out of reach here: download the pack, then in the gist page that opened, name the file ender.pack.json and paste it in.',
		}),
	);
};

/**
 * A dialog making a pack of a list of mods: its name, game version and loader, the pack as it reads, and ways to keep
 * it: copied, downloaded, published as a gist, or on this machine, made into an instance.
 */
export const packDialog = items => {
	const asked = readQuery(location.search);
	const choice = { name: 'My pack', minecraft: asked.minecraft, loader: asked.loader ?? 'fabric' };
	const preview = new Command({ tag: 'pre', style: { maxHeight: '220px', overflow: 'auto', whiteSpace: 'pre' } });
	const result = new Stack();
	const current = () => packOf({ ...choice, items });
	const draw = () => {
		preview.elem.textContent = textOf(current());
	};
	const name = new Input({
		value: choice.name,
		onInput: ({ target: { value } }) => {
			choice.name = value.trim() || 'My pack';
			draw();
		},
	});
	const minecraft = new Select({
		options: choice.minecraft ? [choice.minecraft] : [],
		value: choice.minecraft ?? '',
		onChange: ({ target: { value } }) => {
			choice.minecraft = value;
			draw();
		},
	});
	const loader = new Select({
		options: PACK_LOADERS.map(value => ({ label: LOADERS[value] ?? value, value })),
		value: choice.loader,
		onChange: ({ target: { value } }) => {
			choice.loader = value;
			draw();
		},
	});
	const local_ = new Stack();

	loadVersions()
		.then(versions => {
			choice.minecraft ??= versions[0];
			minecraft.options.options = versions;
			minecraft.options.value = choice.minecraft;
			draw();
		})
		.catch(() =>
			result.content(
				new Meta({ textContent: "Mojang's versions did not load; type one into the pack after copying it" }),
			),
		);

	local.ready().then(served => {
		if (!served) return;

		local_.content(
			new Button({
				icon: 'plus',
				textContent: 'Make an instance of it',
				onPointerPress: async () => {
					const wanted = instanceNameOf(choice.name);

					result.content(
						new Meta({ textContent: `Making ${wanted}; ender fetches the game and the mods, which takes a while` }),
					);

					try {
						await local.create({
							name: wanted,
							minecraft: choice.minecraft,
							loader: choice.loader,
							specs: current().mods,
						});
						result.content(new Meta({ textContent: `Made ${wanted}: it is on the Instances page` }));
					} catch (error) {
						result.content(new Meta({ textContent: `${wanted} was not made: ${error.message}` }));
					}
				},
			}),
		);
	});

	draw();

	const dialog = new Dialog({
		header: `A pack of ${items.length === 1 ? 'one mod' : `${items.length} mods`}`,
		size: 'fit',
		body: new Stack({
			append: [
				new Row({
					append: [
						new Label({ label: 'Name', append: name }),
						new Label({ label: 'Minecraft', append: minecraft }),
						new Label({ label: 'Loader', append: loader }),
					],
				}),
				new Meta({
					tag: 'p',
					textContent: 'Only the mods chosen go in: ender resolves what they need where the pack is installed.',
				}),
				preview,
				result,
				local_,
			],
		}),
		footer: [
			new Button({
				icon: 'copy',
				variant: 'flat',
				textContent: 'Copy',
				onPointerPress: async () => {
					const copied = await copyToClipboard(textOf(current()));

					new Notify({
						intent: copied ? 'success' : 'warning',
						content: copied ? 'Copied the pack' : 'The clipboard is out of reach here; download the pack instead',
					});
				},
			}),
			new Button({
				icon: 'download',
				variant: 'flat',
				textContent: 'Download',
				onPointerPress: () => download(current()),
			}),
			new Button({ icon: 'share', textContent: 'Publish as gist', onPointerPress: () => publish(current(), result) }),
			new Button({ variant: 'flat', textContent: 'Close', onPointerPress: () => dialog.close() }),
		],
	});

	return dialog;
};
