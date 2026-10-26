import { Button, Notify, Select } from '@vanilla-bean/components';
import { specFor } from 'ender-launcher/spec';

import { collection } from './collection';
import { local } from './local';
import { titleOf } from './search';
import { Chip } from './ui';

const specOf = entry => specFor(entry.host ?? 'github', entry.repo);

/** The last lines ender printed, which say what it did or why it could not. */
const tail = output => (output ?? '').split('\n').filter(Boolean).slice(-3).join('\n');

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

/** Run ender on this machine and say how it went. */
export const runLocally = async (verb, entries) => {
	const named = entries.length === 1 ? titleOf(entries[0]) : `${entries.length} mods`;

	try {
		const output = await local[verb](entries, specOf);

		new Notify({
			intent: 'success',
			content: `${verb === 'add' ? 'Installed' : 'Removed'} ${named} in ${local.selected}`,
		});

		return output;
	} catch (error) {
		new Notify({ intent: 'danger', content: `${named}: ${tail(error.message)}` });
	}
};

const BUTTON_LOOKS = {
	busy: { icon: 'spinner', text: 'Working' },
	installed: { icon: 'trash', text: 'Remove' },
	missing: { icon: 'download', text: 'Install' },
};

/** On this machine only: whether the chosen instance has it, and the button that changes that. */
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

/** The instance that installing changes, chosen once for every page. */
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
