import { Button, Dialog, Input, Label, Link, Select, copyToClipboard } from '@vanilla-bean/components';
import { assetEntry, PACK_FORMAT } from 'ender-launcher/enderPack';
import { specFor } from 'ender-launcher/spec';

import { listingButton } from './controls';
import { loadVersions } from './data';
import { lastSaid, local } from './local';
import { LOADERS, readQuery } from './search';
import { Command, Meta, Row, Stack } from './ui';

const words = text => (text ?? '').split(/[\s,]+/).filter(Boolean);

/** The servers typed one to a line, a name then its address, as a pack lists them; a line with no address is skipped. */
export const serversTyped = text =>
	(text ?? '')
		.split('\n')
		.map(line => line.trim().split(/\s+/))
		.filter(parts => parts.length >= 2 && /^[\w.-]+(:\d{1,5})?$/.test(parts.at(-1)))
		.map(parts => ({ name: parts.slice(0, -1).join(' '), address: parts.at(-1) }));

/** The resource or shader packs typed, each a spec an ender pack takes: mr:, cf: or an https link. */
export const packsTyped = text => words(text).filter(spec => assetEntry(spec) !== undefined);

/**
 * A pack of the mods chosen, and what the maker adds to it: who made it and its version, a pinned loader, the memory it
 * asks for, mods offered as optional, resource and shader packs, and servers. Only what is given is written.
 */
export const packOf = ({
	name,
	minecraft,
	loader,
	items,
	version,
	author,
	loaderVersion,
	memory,
	optional = new Set(),
	resourcepacks,
	shaderpacks,
	servers,
}) => {
	const text = value => (value?.trim() ? value.trim() : undefined);
	const assets = { resourcepacks: packsTyped(resourcepacks), shaderpacks: packsTyped(shaderpacks) };
	const listed = serversTyped(servers);

	return {
		format: PACK_FORMAT,
		name,
		...(text(version) ? { version: text(version) } : {}),
		...(text(author) ? { author: text(author) } : {}),
		minecraft,
		loader,
		...(text(loaderVersion) && loader !== 'vanilla' ? { loaderVersion: text(loaderVersion) } : {}),
		...(memory ? { memory } : {}),
		mods: items.map(item => {
			const spec = specFor(item.host ?? 'github', item.repo);

			return optional.has(spec) ? { spec, optional: true } : spec;
		}),
		...Object.fromEntries(Object.entries(assets).filter(([, specs]) => specs.length > 0)),
		...(listed.length > 0 ? { servers: listed } : {}),
	};
};

/** Held to ender's rule for instance names. */
export const instanceNameOf = name =>
	name
		.trim()
		.toLowerCase()
		.replaceAll(/[^\w.-]+/g, '-')
		.replaceAll(/^[-.]+|-+$/g, '')
		.slice(0, 64) || 'pack';

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
		await local.loadAccount();

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
					append: [new Command({ code: line, copyButton: true }), new Meta({ textContent: 'installs it anywhere' })],
				}),
				new Row({ append: listingButton(url) }),
			]);
		} catch (error) {
			result.content(new Meta({ textContent: `It was not published: ${error.message}` }));
		}

		return;
	}

	// Both begin while the press still counts as one, or a browser may block the new tab and the clipboard
	const copying = copyToClipboard(textOf(pack));
	const opened = window.open('https://gist.github.com/', '_blank');

	if (opened) opened.opener = null;

	const copied = await copying;

	result.content([
		new Meta({
			tag: 'p',
			textContent: copied
				? "The pack is copied. On GitHub's new gist page, name the file ender.pack.json, paste it, and create a secret gist; then anyone can install it with ender import and the gist link."
				: "The clipboard is out of reach here: download the pack, then on GitHub's new gist page name the file ender.pack.json and paste it in.",
		}),
		...(opened
			? []
			: [new Link({ href: 'https://gist.github.com/', target: '_blank', textContent: 'Open a new gist' })]),
	]);
};

export const packDialog = items => {
	const asked = readQuery(location.search);
	const choice = { name: 'My pack', minecraft: asked.minecraft, loader: asked.loader ?? 'fabric', optional: new Set() };
	const preview = new Command({
		multiline: true,
		language: 'json',
		copyButton: true,
		style: { display: 'block', maxHeight: '220px', overflow: 'auto', whiteSpace: 'pre' },
	});
	const result = new Stack();
	const current = () => packOf({ ...choice, items });
	const draw = () => {
		preview.options.code = textOf(current());
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
		options: Object.entries(LOADERS).map(([value, label]) => ({ label, value })),
		value: choice.loader,
		onChange: ({ target: { value } }) => {
			choice.loader = value;
			draw();
		},
	});
	const local_ = new Stack();
	const typed = (key, label, placeholder, tag = 'input') =>
		new Label(
			{ label },
			new Input({
				tag,
				placeholder,
				onInput: ({ target: { value } }) => {
					choice[key] = value;
					draw();
				},
			}),
		);
	const memory = new Select({
		options: [
			{ label: 'Not asked', value: '' },
			...[4, 6, 8, 12].map(gigabytes => ({ label: `${gigabytes} GB`, value: String(gigabytes * 1024) })),
		],
		value: '',
		onChange: ({ target: { value } }) => {
			choice.memory = value ? Number(value) : undefined;
			draw();
		},
	});
	const optionalChoices = items.map(item => {
		const spec = specFor(item.host ?? 'github', item.repo);

		return new Label(
			{ label: `${item.title ?? item.repo} is optional`, variant: 'inline-after' },
			new Input({
				type: 'checkbox',
				value: false,
				onChange: ({ target: { checked } }) => {
					if (checked) choice.optional.add(spec);
					else choice.optional.delete(spec);

					draw();
				},
			}),
		);
	});
	const more = new Stack({
		style: { display: 'none', gap: 'var(--space-sm, 8px)' },
		append: [
			new Row({
				append: [
					typed('version', 'Version', '1.0'),
					typed('author', 'Author', 'who made it'),
					typed('loaderVersion', 'Loader version', 'the newest, unless pinned'),
					new Label({ label: 'Memory' }, memory),
				],
			}),
			typed('resourcepacks', 'Resource packs', 'mr:faithful-32x, cf:…, or https links'),
			typed('shaderpacks', 'Shader packs', 'mr:complementary-reimagined'),
			typed('servers', 'Servers, one to a line', 'Our server play.example.com:25565', 'textarea'),
			new Meta({ tag: 'p', textContent: 'Optional mods are off until a player turns them on.' }),
			...optionalChoices,
		],
	});
	const moreToggle = new Button({
		variant: 'flat',
		icon: 'chevron-down',
		textContent: 'More: version, loader, memory, packs, servers, optional mods',
		onPointerPress: () => {
			more.elem.style.display = more.elem.style.display === 'none' ? '' : 'none';
		},
	});

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
					const watching = new AbortController();

					try {
						const job = await local.importMadePack(current(), wanted);

						local.watchJobs(
							() => result.content(new Meta({ textContent: lastSaid(job.lines) || `Making ${wanted}` })),
							watching.signal,
						);
						await local.finished(job);
						result.content(new Meta({ textContent: `Made ${wanted}: it is on the Instances page` }));
					} catch (error) {
						result.content(new Meta({ textContent: `${wanted} was not made: ${error.message}` }));
					} finally {
						watching.abort();
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
						new Label({ label: 'Name' }, name),
						new Label({ label: 'Minecraft' }, minecraft),
						new Label({ label: 'Loader' }, loader),
					],
				}),
				new Meta({
					tag: 'p',
					textContent: 'Only the mods chosen go in: ender resolves what they need where the pack is installed.',
				}),
				moreToggle,
				more,
				preview,
				result,
				local_,
			],
		}),
		footer: [
			new Button({ variant: 'flat', textContent: 'Close', onPointerPress: () => dialog.close() }),
			new Button({
				icon: 'download',
				variant: 'flat',
				textContent: 'Download',
				onPointerPress: () => download(current()),
			}),
			new Button({ icon: 'share', textContent: 'Publish as gist', onPointerPress: () => publish(current(), result) }),
		],
	});

	return dialog;
};
