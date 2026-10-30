import { Button, Component, Dialog, Link, Notify, Select } from '@vanilla-bean/components';
import { specFor } from 'ender-launcher/spec';

import { collection } from './collection';
import { local } from './local';
import { loadInterest } from './data';
import { BUILT_FROM_SOURCE, askUrl, askedUrl, hasAsked, titleOf } from './search';
import { Chip } from './ui';

const specOf = entry => specFor(entry.host ?? 'github', entry.repo);

export const collectButton = entry => {
	const collected = collection.has(entry);

	return new Button({
		icon: collected ? 'check' : 'plus',
		variant: collected ? undefined : 'flat',
		intent: collected ? 'success' : undefined,
		textContent: collected ? 'Collected' : 'Collect',
		tooltip: collected ? 'Take it out of the collection' : 'Gather it with others to install together',
		onPointerPress: () => collection.toggle(entry, titleOf(entry)),
	});
};

/** Whether the player allows building the mods among these that have no jar, asked before ender builds any. */
const allowsBuilding = async entries => {
	const sourced = entries.filter(entry => entry.fromSource);

	if (sourced.length === 0) return true;

	return Dialog.confirm({
		header: `Build ${sourced.length === 1 ? titleOf(sourced[0]) : `${sourced.length} mods`} from source?`,
		body: BUILT_FROM_SOURCE,
		confirmLabel: 'Build',
		intent: 'warning',
	});
};

export const runLocally = async (verb, entries) => {
	const named = entries.length === 1 ? titleOf(entries[0]) : `${entries.length} mods`;
	const building = verb === 'add' && entries.some(entry => entry.fromSource);

	if (building && !(await allowsBuilding(entries))) return undefined;

	try {
		const output = await local[verb](entries, specOf, { build: building });

		new Notify({
			intent: 'success',
			content: `${verb === 'add' ? 'Installed' : 'Removed'} ${named} in ${local.selected}`,
		});

		return output;
	} catch (error) {
		new Notify({ intent: 'danger', content: `${named}: ${error.message}` });
	}
};

const BUTTON_LOOKS = {
	busy: { icon: 'spinner', text: 'Working' },
	installed: { icon: 'trash', text: 'Remove' },
	missing: { icon: 'download', text: 'Install' },
};

export const installControls = entry => {
	if (local.selected === undefined) return [];

	const installed = local.isInstalled(entry);
	const busy = local.isBusy(entry);
	const look = busy ? BUTTON_LOOKS.busy : BUTTON_LOOKS[installed ? 'installed' : 'missing'];

	return [
		...(installed ? [new Chip({ addClass: 'installed', textContent: `in ${local.selected}` })] : []),
		new Button({
			icon: look.icon,
			variant: installed ? 'flat' : undefined,
			textContent: look.text,
			tooltip: installed ? `Drop it from ${local.selected}` : `Add it and what it needs to ${local.selected}`,
			disabled: busy,
			onPointerPress: () => runLocally(installed ? 'drop' : 'add', [entry]),
		}),
	];
};

/**
 * Ask the index for a way to pay a mod's author, or for a built release. Served by ender signed in to GitHub, one press
 * files the ask as that account; otherwise it opens the issue form, filled in, for the player to send.
 */
export const askControl = (entry, kind, { textContent, tooltip, variant }) => {
	const holder = new Component({
		tag: 'span',
		append: new Link({ href: askUrl(entry, kind), target: '_blank', textContent, tooltip, variant }),
	});

	local.ready().then(async served => {
		if (!served) return;

		await local.loadAccount();

		if (!local.login) return;

		const { interest } = await loadInterest().catch(() => ({ interest: {} }));

		if (hasAsked(interest, entry, kind, local.login)) {
			holder.content(
				new Link({ href: askedUrl(entry, local.login), target: '_blank', textContent: `Asked, as ${local.login}` }),
			);

			return;
		}

		let asking = false;

		holder.content(
			new Link({
				href: askUrl(entry, kind),
				textContent,
				tooltip: `${tooltip ? `${tooltip} ` : ''}Asked as ${local.login} on GitHub.`,
				variant,
				onPointerPress: async event => {
					event.preventDefault();

					if (asking) return;

					asking = true;

					try {
						const { url, before } = await local.ask(entry, kind);

						holder.content(
							new Link({
								href: url,
								target: '_blank',
								textContent: `${before ? 'Asked before' : 'Asked'}, as ${local.login}`,
							}),
						);
					} catch (error) {
						asking = false;
						new Notify({ intent: 'danger', content: `The index was not asked: ${error.message}` });
					}
				},
			}),
		);
	});

	return holder;
};

/** Ask the index to list a published pack, as the GitHub account ender signs in with; nothing when it has none. */
export const listingButton = link => {
	if (!local.login) return [];

	const holder = new Component({ tag: 'span' });
	const button = new Button({
		icon: 'list',
		variant: 'flat',
		textContent: 'List it on the index',
		tooltip: `Asks the index to list it, as ${local.login} on GitHub; it is listed within a few minutes`,
		onPointerPress: async () => {
			button.elem.disabled = true;

			try {
				const { url, before } = await local.listPack(link);

				holder.content(
					new Link({
						href: url,
						target: '_blank',
						textContent: before ? 'Asked the index to list it before' : 'Asked the index to list it',
					}),
				);
			} catch (error) {
				button.elem.disabled = false;
				new Notify({ intent: 'danger', content: `The index was not asked to list it: ${error.message}` });
			}
		},
	});

	holder.content(button);

	return [holder];
};

/** Star a mod's repository on GitHub, as the account ender signs in with, or take the star back. */
export const starButton = entry => {
	if (!local.canStar(entry)) return [];

	const starred = local.isStarred(entry);

	return [
		new Button({
			icon: 'star',
			variant: starred ? undefined : 'flat',
			textContent: starred ? 'Starred' : 'Star',
			tooltip: starred ? 'Take back your star on GitHub' : 'Star it on GitHub, as the account ender signs in with',
			onPointerPress: () =>
				local
					.star(entry, !starred)
					.catch(error => new Notify({ intent: 'danger', content: `GitHub did not take that: ${error.message}` })),
		}),
	];
};

export const instancePicker = () =>
	new Select({
		options: local.instances.map(instance => ({
			label: `${instance.name} :: ${instance.minecraft} ${instance.loader?.type ?? ''}`,
			value: instance.name,
		})),
		value: local.selected,
		title: 'The instance installing changes',
		style: { width: 'auto' },
		onChange: ({ target: { value } }) => local.select(value),
	});
