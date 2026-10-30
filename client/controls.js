import { Button, Dialog, Notify, Select } from '@vanilla-bean/components';
import { specFor } from 'ender-launcher/spec';

import { collection } from './collection';
import { local } from './local';
import { BUILT_FROM_SOURCE, titleOf } from './search';
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
