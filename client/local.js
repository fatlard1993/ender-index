import { readStorage, writeStorage } from '@vanilla-bean/components';

import { collectionKey } from './search';
import { loadJson } from './ui';

const SELECTED_KEY = 'ender-index:instance';

/** Where ender records a mod by its repository: the same host and name the index lists it under. */
const REPOSITORY_SOURCES = new Set(['github', 'codeberg', 'gitlab']);

const listeners = new Set();

const state = { all: [], instances: [], selected: undefined, installed: new Set(), busy: new Set() };

const notify = () => {
	for (const listener of listeners) listener(state);
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

	state.all = await response.json();
	state.instances = state.all.filter(instance => instance.type === 'client');

	const wanted = readStorage(SELECTED_KEY);

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

/** Ask ender something through the page's own server, or throw what it said went wrong. */
const call = async (method, path, body) => {
	const response = await fetch(`./api/${path}`, {
		method,
		headers: { 'content-type': 'application/json' },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const result = await response.json().catch(() => ({}));

	if (!response.ok) throw new Error(result.error ?? result.output ?? `ender answered ${response.status}`);

	return result;
};

/** The instances again, after one was made, imported or deleted; the chosen one kept while it is still there. */
const reload = async () => {
	state.all = await call('GET', 'instances');
	state.instances = state.all.filter(instance => instance.type === 'client');

	if (!state.instances.some(instance => instance.name === state.selected)) state.selected = state.instances[0]?.name;

	await refresh().catch(() => {});
	notify();
};

const named = name => `instances/${encodeURIComponent(name)}`;

const thenReload = async work => {
	try {
		return await work;
	} finally {
		await reload().catch(() => notify());
	}
};

export const local = {
	/** Whether this page can manage the instances on this machine. */
	ready: () => (detected ??= detect().catch(() => false)),
	get instances() {
		return state.instances;
	},
	/** Every instance on this machine, servers too. */
	get all() {
		return state.all;
	},
	reload,
	details: name => call('GET', named(name)),
	create: wanted => thenReload(call('POST', 'instances', wanted)),
	importPack: source => thenReload(call('POST', 'import', { source })),
	update: name => thenReload(call('POST', `${named(name)}/update`)),
	launch: (name, { update = false } = {}) => call('POST', `${named(name)}/launch`, { update }),
	remove: name => thenReload(call('DELETE', named(name))),
	publishInstance: name => call('POST', `${named(name)}/gist`),
	dropFrom: (name, specs) => thenReload(call('POST', `${named(name)}/drop`, { specs })),
	publishPack: pack => call('POST', 'gists', { pack }),
	get selected() {
		return state.selected;
	},
	select: async name => {
		state.selected = name;

		writeStorage(SELECTED_KEY, name);

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
