import { collectionKey } from './search';
import { loadJson } from './ui';

const SELECTED_KEY = 'ender-index:instance';

/** Where ender records a mod by its repository: the same host and name the index lists it under. */
const REPOSITORY_SOURCES = new Set(['github', 'codeberg', 'gitlab']);

const listeners = new Set();

const state = { instances: [], selected: undefined, installed: new Set(), busy: new Set() };

const notify = () => {
	for (const listener of listeners) listener(state);
};

const remembered = () => {
	try {
		return localStorage.getItem(SELECTED_KEY) ?? undefined;
	} catch {
		return undefined;
	}
};

/** Every repository the instance holds, asked for or pulled in by another, keyed the way the collection keys them. */
export const installedKeys = shown =>
	new Set(
		[...(shown.mods ?? []), ...(shown.installed ?? [])]
			.filter(mod => REPOSITORY_SOURCES.has(mod.source))
			.map(mod => `${mod.source}:${mod.id}`),
	);

const refresh = async () => {
	if (state.selected === undefined) return;

	state.installed = installedKeys(await loadJson(`./api/instances/${encodeURIComponent(state.selected)}`));
	notify();
};

/**
 * Present only when the page is served by `bun run local`: the hosted page has no api to answer, so it never offers to
 * change anything.
 */
const detect = async () => {
	const response = await fetch('./api/instances').catch(() => undefined);

	if (!response?.ok || !response.headers.get('content-type')?.includes('json')) return false;

	state.instances = (await response.json()).filter(instance => instance.type === 'client');

	const wanted = remembered();

	state.selected = (
		state.instances.find(instance => instance.name === wanted) ??
		state.instances.find(instance => instance.active) ??
		state.instances[0]
	)?.name;

	await refresh();

	return true;
};

let detected;

const change = async (verb, specs, keys) => {
	for (const key of keys) state.busy.add(key);
	notify();

	try {
		const response = await fetch(`./api/instances/${encodeURIComponent(state.selected)}/${verb}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ specs }),
		});
		const result = await response.json();

		if (!response.ok) throw new Error(result.error ?? result.output ?? `ender ${verb} failed`);

		return result.output;
	} finally {
		for (const key of keys) state.busy.delete(key);
		await refresh().catch(() => notify());
	}
};

export const local = {
	/** Whether this page can manage the instances on this machine. */
	ready: () => (detected ??= detect().catch(() => false)),
	get instances() {
		return state.instances;
	},
	get selected() {
		return state.selected;
	},
	select: async name => {
		state.selected = name;

		try {
			localStorage.setItem(SELECTED_KEY, name);
		} catch {
			// Not remembered past this page
		}

		state.installed = new Set();
		notify();
		await refresh();
	},
	isInstalled: entry => state.installed.has(collectionKey(entry)),
	isBusy: entry => state.busy.has(collectionKey(entry)),
	add: (entries, specFor) => change('add', entries.map(specFor), entries.map(collectionKey)),
	drop: (entries, specFor) => change('drop', entries.map(specFor), entries.map(collectionKey)),
	subscribe: (listener, signal) => {
		listeners.add(listener);
		signal?.addEventListener('abort', () => listeners.delete(listener));
	},
};
