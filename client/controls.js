import { Button, Component, Dialog, Link, Notify, Select } from '@vanilla-bean/components';
import { specFor } from 'ender-launcher/spec';

import { collection } from './collection';
import { heldBack, heldBuilds, local } from './local';
import { loadInterest } from './data';
import { BUILT_FROM_SOURCE, askUrl, askedUrl, askedCount, hasAsked, titleOf } from './search';
import { Chip, Meta } from './ui';

const specOf = entry => specFor(entry.host ?? 'github', entry.repo);

export const collectButton = entry => {
	const collected = collection.has(entry);

	return new Button({
		icon: 'plus',
		variant: 'flat',
		pressed: collected,
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

/**
 * Ask the player to allow the build scripts a job was held for, showing which changed and the diff of them: they run
 * on this machine with the player's permissions. Answers whether they allowed them.
 */
export const confirmHeldBuilds = async job => {
	const held = heldBuilds(job);
	const diffs = await Promise.all(held.map(build => local.buildDiff(build).catch(() => undefined)));
	const body = new Component({
		tag: 'div',
		append: held.flatMap((build, at) => [
			new Component({
				tag: 'p',
				textContent: `${build.key}'s build scripts changed since you allowed building it. They run on this machine with your permissions when it builds, so read what changed before allowing them.`,
			}),
			...build.changes.map(change => new Meta({ tag: 'div', textContent: change })),
			new Component({
				tag: 'pre',
				textContent:
					diffs[at] ??
					'ender could not show the diff here (it uses git); the output above names both copies to compare.',
				style: { maxHeight: '50vh', overflow: 'auto', whiteSpace: 'pre', fontSize: '0.85em' },
			}),
		]),
	});

	return Dialog.confirm({
		header:
			held.length === 1 ? `Allow ${held[0].key}'s new build scripts?` : `Allow ${held.length} mods' new build scripts?`,
		body,
		confirmLabel: 'Allow and build',
		intent: 'warning',
	});
};

/** Offer the review of a held build, and on the player's word allow its scripts and run the job again. */
const offerHeldBuild = (named, job) =>
	new Notify({
		intent: 'warning',
		content: `${named} was not installed: its build scripts changed since you allowed building it.`,
		timeout: 0,
		actions: [
			{
				textContent: 'See what changed',
				onPointerPress: async () => {
					if (!(await confirmHeldBuilds(job))) return;

					try {
						await local.finished(await local.allowBuildsAndRetry(job));
						new Notify({ intent: 'success', content: `Installed ${named}, with its new build scripts allowed` });
					} catch (error) {
						new Notify({ intent: 'danger', content: `${named}: ${error.message}` });
					}
				},
			},
		],
	});

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
		if (heldBack(error.job).length > 0) return offerTrust(named, error.job);
		if (heldBuilds(error.job).length > 0) return offerHeldBuild(named, error.job);

		new Notify({ intent: 'danger', content: `${named}: ${error.message}` });
	}
};

/**
 * Say that ender held a jar back for naming where other programs keep logins, and offer the one way past it: trusting
 * that jar by its hash and running the install again. Pressing it is the player's own decision, said in full first.
 */
const offerTrust = (named, job) =>
	new Notify({
		intent: 'danger',
		content: `${named} was not installed: its code names where other programs keep logins, such as Discord's token or a browser's saved passwords. No mod has a reason to. Install it only if you are sure of where it came from.`,
		actions: [
			{
				textContent: 'I trust it: install anyway',
				onPointerPress: async () => {
					try {
						await local.finished(await local.trustAndRetry(job));
						new Notify({ intent: 'success', content: `Installed ${named}, trusted by its hash` });
					} catch (error) {
						new Notify({
							intent: error.trusted ? 'info' : 'danger',
							content: `${named}: ${error.message}`,
							...(error.trusted ? { timeout: 0 } : {}),
						});
					}
				},
			},
		],
	});

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

/** How many players have asked this of a mod, with the index's note to its author once there is one. */
const askedLine = asked => {
	const line = new Meta({ tag: 'span' });

	asked
		.then(({ count, note, closed }) => {
			if (count === 0 || closed) return;

			line.content([
				` ${count} ${count === 1 ? 'player has' : 'players have'} asked`,
				...(note
					? [
							': ',
							new Link({
								href: note.issue.url,
								target: '_blank',
								textContent: 'a draft of the note to its author',
							}),
						]
					: []),
			]);
		})
		.catch(() => {});

	return line;
};

/**
 * Ask the index for a way to pay a mod's author, or for a built release, beside how many have asked. Served by ender
 * signed in to GitHub, one press files the ask as that account; otherwise it opens the issue form, filled in, for the
 * player to send.
 */
export const askControl = (entry, kind, { textContent, tooltip, variant }) => {
	const holder = new Component({
		tag: 'span',
		append: new Link({ href: askUrl(entry, kind), target: '_blank', textContent, tooltip, variant }),
	});
	const asked = loadInterest()
		.then(({ interest, notices }) => ({ interest, ...askedCount(interest, notices, entry, kind) }))
		.catch(() => ({ interest: {}, count: 0 }));
	const control = new Component({ tag: 'span', append: [holder, askedLine(asked)] });

	local.ready().then(async served => {
		if (!served) return;

		await local.loadAccount();

		const { interest } = await asked;

		if (!local.login) return;

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

	return control;
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
			button.options.disabled = true;

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
				button.options.disabled = false;
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
			variant: 'flat',
			pressed: starred,
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
