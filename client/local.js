import { readStorage, writeStorage } from '@vanilla-bean/components';

import { collectionKey, starKey } from './search';

const SELECTED_KEY = 'ender-index:instance';

const FOLLOW_EVERY = 500;

/** Where ender records a mod by its repository: the same host and name the index lists it under. */
const REPOSITORY_SOURCES = new Set(['github', 'codeberg', 'gitlab']);

const listeners = new Set();
const jobListeners = new Set();

const state = {
	all: [],
	instances: [],
	selected: undefined,
	installed: new Set(),
	busy: new Set(),
	error: undefined,
	jobs: new Map(),
	stars: undefined,
	starsError: undefined,
	login: undefined,
	accountError: undefined,
};

const notify = () => {
	for (const listener of listeners) listener(state);
};

const notifyJobs = () => {
	for (const listener of jobListeners) listener(state.jobs);
};

const listen = (set, listener, signal) => {
	set.add(listener);
	signal?.addEventListener('abort', () => set.delete(listener));
};

/** Every repository the instance holds, asked for or pulled in by another, keyed the way the collection keys them. */
export const installedKeys = shown =>
	new Set(
		[...(shown.mods ?? []), ...(shown.installed ?? [])]
			.filter(mod => REPOSITORY_SOURCES.has(mod.source))
			.map(mod => `${mod.source}:${mod.id}`),
	);

export const lastSaid = lines => (lines.findLast(line => line.trim()) ?? '').replace(/^(ok|!!|xx|::) /, '');

export const failureOf = job =>
	job.error ??
	`${job.title} did not finish (ender exited ${job.code})${job.lines.length > 0 ? `: ${job.lines.slice(-3).join('\n')}` : ''}`;

const call = async (method, path, body) => {
	const response = await fetch(`./api/${path}`, {
		method,
		headers: { 'content-type': 'application/json' },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const result = await response.json().catch(() => ({}));

	if (!response.ok) {
		throw Object.assign(new Error(result.error ?? `ender web answered ${response.status}`), {
			status: response.status,
		});
	}

	return result;
};

const named = name => `instances/${encodeURIComponent(name)}`;

const refresh = async () => {
	if (state.selected === undefined) return;

	state.installed = installedKeys(await call('GET', named(state.selected)));
	notify();
};

const reload = async () => {
	try {
		state.all = await call('GET', 'instances');
		state.error = undefined;
	} catch (error) {
		state.error = `ender could not list its instances: ${error.message}`;
		notify();

		return;
	}

	state.instances = state.all.filter(instance => instance.type === 'client');

	const names = [
		state.selected,
		readStorage(SELECTED_KEY),
		state.instances.find(instance => instance.active)?.name,
		state.instances[0]?.name,
	];

	state.selected = names.find(name => state.instances.some(instance => instance.name === name));

	await refresh().catch(() => {});
	notify();
};

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const follow = async job => {
	while (job.state === 'running') {
		await sleep(FOLLOW_EVERY);

		try {
			const { lines, next, ...shown } = await call('GET', `jobs/${encodeURIComponent(job.id)}?from=${job.next}`);

			Object.assign(job, shown, { next });
			job.lines.push(...lines);
		} catch (error) {
			Object.assign(job, { state: 'lost', error: `ender web stopped answering about ${job.title}: ${error.message}` });
		}

		notifyJobs();
	}

	return job;
};

const track = shown => {
	if (state.jobs.has(shown.id)) return state.jobs.get(shown.id);

	const job = { ...shown, lines: [], next: 0 };

	state.jobs.set(job.id, job);
	job.done = follow(job);
	notifyJobs();

	return job;
};

const start = async (method, path, body) => track((await call(method, path, body)).job);

/** Whether the page is served by ender web: the hosted page has no api to answer, so it never offers to change anything. */
const detect = async () => {
	const response = await fetch('./api/ender').catch(() => undefined);

	if (!response?.ok || !response.headers.get('content-type')?.includes('json')) return false;

	await reload();

	const jobs = await call('GET', 'jobs').catch(() => []);

	for (const job of jobs.filter(each => each.state === 'running').toReversed()) track(job);

	return true;
};

let detected;

const finished = async (job, { reloading = true } = {}) => {
	await job.done;

	if (reloading) await reload();
	if (job.state !== 'done') throw new Error(failureOf(job));

	return job;
};

const change = async (verb, specs, keys, { build = false } = {}) => {
	for (const key of keys) state.busy.add(key);
	notify();

	try {
		const job = await finished(
			await start('POST', `${named(state.selected)}/${verb}`, { specs, ...(build ? { build } : {}) }),
			{
				reloading: false,
			},
		);

		return job.lines.join('\n');
	} finally {
		for (const key of keys) state.busy.delete(key);
		await refresh().catch(() => notify());
	}
};

let starsAsked;

/**
 * The player's GitHub stars, asked of ender web once. An ender too old to keep them answers 404, and the page then
 * offers nothing of stars; any other refusal, such as no account to sign in with, is kept to be said.
 */
const loadStars = () =>
	(starsAsked ??= call('GET', 'stars')
		.then(({ repositories }) => {
			state.stars = new Set(repositories.map(repository => starKey({ host: 'github', repo: repository })));
		})
		.catch(error => {
			if (error.status !== 404) state.starsError = error.message;
		})
		.finally(notify));

let accountAsked;

/** Who ender signs in to GitHub as, asked once; an ender too old to say answers 404, and the page asks nothing as them. */
const loadAccount = () =>
	(accountAsked ??= call('GET', 'account')
		.then(({ login }) => {
			state.login = login;
		})
		.catch(error => {
			if (error.status !== 404) state.accountError = error.message;
		})
		.finally(notify));

const starPath = entry => `stars/${entry.repo.split('/').map(encodeURIComponent).join('/')}`;

export const local = {
	ready: () => (detected ??= detect().catch(() => false)),
	get instances() {
		return state.instances;
	},
	/** Every instance on this machine, servers too. */
	get all() {
		return state.all;
	},
	get error() {
		return state.error;
	},
	reload,
	details: name => call('GET', named(name)),
	/** Each of these starts a job and answers it; finished(job) waits for it to end. */
	create: wanted => start('POST', 'instances', wanted),
	importPack: source => start('POST', 'import', { source }),
	update: name => start('POST', `${named(name)}/update`),
	launch: (name, { update = false } = {}) => start('POST', `${named(name)}/launch`, { update }),
	remove: name => start('DELETE', named(name)),
	dropFrom: (name, specs) => start('POST', `${named(name)}/drop`, { specs }),
	finished,
	jobFor: name => [...state.jobs.values()].findLast(job => job.instance === name),
	watchJobs: (listener, signal) => listen(jobListeners, listener, signal),
	publishInstance: (name, { fresh = false } = {}) => call('POST', `${named(name)}/gist`, fresh ? { fresh } : {}),
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
	/** build allows ender to build what has no jar from its source. */
	add: (entries, specFor, { build = false } = {}) =>
		change('add', entries.map(specFor), entries.map(collectionKey), { build }),
	drop: (entries, specFor) => change('drop', entries.map(specFor), entries.map(collectionKey)),
	subscribe: (listener, signal) => listen(listeners, listener, signal),
	/** The keys of every repository the player starred, or undefined until ender web has said. */
	get starred() {
		return state.stars;
	},
	get starsError() {
		return state.starsError;
	},
	loadStars,
	/** The GitHub login ender acts as, or undefined until it has said, or when it has none. */
	get login() {
		return state.login;
	},
	get accountError() {
		return state.accountError;
	},
	loadAccount,
	/** Each files an issue on the index as that account, and answers its link. */
	ask: (entry, kind) => call('POST', 'asks', { kind, mod: collectionKey(entry) }),
	listPack: pack => call('POST', 'listings', { pack }),
	listMod: mod => call('POST', 'listings', { mod }),
	canStar: entry => state.stars !== undefined && (entry.host ?? 'github') === 'github',
	isStarred: entry => state.stars?.has(starKey(entry)) ?? false,
	star: async (entry, starring) => {
		await call(starring ? 'PUT' : 'DELETE', starPath(entry));

		if (starring) state.stars.add(starKey(entry));
		else state.stars.delete(starKey(entry));

		notify();
	},
};
