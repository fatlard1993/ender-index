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
	organizations: [],
	accountError: undefined,
	players: undefined,
	playersError: undefined,
	upgrade: undefined,
	ender: undefined,
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

/**
 * The jars a failed job's sync held back for naming where other programs keep logins, by the hash ender printed for
 * each: what the player can trust, one jar at a time, and nothing else.
 */
export const heldBack = job => [
	...new Set(
		(job?.lines ?? []).flatMap(line => [...line.matchAll(/\[sha256:([0-9a-f]{64})\]/g)].map(([, hash]) => hash)),
	),
];

/**
 * The source builds a failed job held because their build scripts changed since the player allowed them, by the mod
 * and commit ender printed for each, with the scripts it said were added, changed or removed.
 */
export const heldBuilds = job => {
	const lines = job?.lines ?? [];
	const held = new Map();

	for (const line of lines) {
		for (const [, key, commit] of line.matchAll(/\[build-scripts:([^\]@\s]+)@([0-9a-f]+)\]/g))
			held.set(`${key}@${commit}`, { key, commit });
	}

	const changes = lines
		.map(line =>
			line
				.trim()
				.match(/^(added|changed|removed): (.+)$/)
				?.slice(1),
		)
		.filter(Boolean);

	return [...held.values()].map(build => ({ ...build, changes: changes.map(([what, paths]) => `${what}: ${paths}`) }));
};

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

/** ender web started from its desktop icon stops 15 minutes after the last request, so an open page asks well within that. */
export const STILL_HERE_EVERY = 5 * 60_000;

export const keepAlive = (ask = () => fetch('./api/ender').catch(() => undefined), every = STILL_HERE_EVERY) =>
	setInterval(ask, every);

/** Whether the page is served by ender web: the hosted page has no api to answer, so it never offers to change anything. */
const detect = async () => {
	const response = await fetch('./api/ender').catch(() => undefined);

	if (!response?.ok || !response.headers.get('content-type')?.includes('json')) return false;

	state.ender = await response.json();

	await reload();

	const jobs = await call('GET', 'jobs').catch(() => []);

	for (const job of jobs.filter(each => each.state === 'running').toReversed()) track(job);
	await recallHeldBack(jobs);

	keepAlive();

	return true;
};

/**
 * Each instance's newest finished job, when it held a jar back: the offer to trust it outlasts the page it was made
 * on, as ender web started from its icon is opened afresh. Its lines are read once, from the start.
 */
const recallHeldBack = async jobs => {
	const newest = new Map();

	for (const job of jobs) if (job.instance && !newest.has(job.instance)) newest.set(job.instance, job);

	for (const job of newest.values()) {
		if (job.state === 'running' || state.jobs.has(job.id)) continue;

		const { lines = [], next = 0 } = await call('GET', `jobs/${encodeURIComponent(job.id)}?from=0`).catch(() => ({}));

		if (heldBack({ lines }).length === 0 && heldBuilds({ lines }).length === 0) continue;

		const kept = { ...job, lines, next };

		kept.done = Promise.resolve(kept);
		state.jobs.set(job.id, kept);
	}

	notifyJobs();
};

let detected;

const finished = async (job, { reloading = true } = {}) => {
	await job.done;

	if (reloading) await reload();
	if (job.state !== 'done') throw Object.assign(new Error(failureOf(job)), { job });

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
		.then(({ login, organizations = [] }) => {
			state.login = login;
			state.organizations = organizations;
		})
		.catch(error => {
			if (error.status !== 404) state.accountError = error.message;
		})
		.finally(notify));

let playersAsked;

/** Who can play: ender's accounts, offline and Microsoft; null from an ender too old to say, which answers 404. */
const loadPlayers = () =>
	(playersAsked ??= call('GET', 'players')
		.then(players => {
			state.players = players;
		})
		.catch(error => {
			if (error.status === 404) state.players = null;
			else state.playersError = error.message;
		})
		.finally(notify));

/** Each change answers with the accounts ender holds afterwards, which the page then shows. */
const changePlayers = async (method, path, body) => {
	state.players = await call(method, path, body);
	state.playersError = undefined;
	notify();
};

/** Whether release `latest` is past `current`, by their dotted numbers. */
export const isNewer = (latest, current) => {
	const parts = version => version.split(/[.+-]/).slice(0, 3).map(Number);
	const [a, b] = [parts(latest), parts(current)];

	for (let index = 0; index < 3; ++index) {
		if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
	}

	return false;
};

/** Whether a newer ender is out than the one serving the page. */
export const updateReady = upgrade =>
	Boolean(upgrade?.latest && upgrade.current && isNewer(upgrade.latest, upgrade.current));

let upgradeAsked;

/** Which ender serves the page, the newest release, and who upgrades it; null from an ender too old to say. */
const loadUpgrade = ({ again = false } = {}) => {
	if (again) upgradeAsked = undefined;

	return (upgradeAsked ??= call('GET', again ? 'upgrade?again' : 'upgrade')
		.then(upgrade => {
			state.upgrade = upgrade;
		})
		.catch(error => {
			state.upgrade = error.status === 404 ? null : { error: error.message };
		})
		.finally(notify));
};

/** Waits until the page is served by an ender other than `before`, asking every half second, for up to `seconds`. */
export const servedBy = async (before, { seconds = 30, ask = () => call('GET', 'ender') } = {}) => {
	for (let waited = 0; waited < seconds * 2; ++waited) {
		await new Promise(resolve => setTimeout(resolve, 500));

		const answer = await ask().catch(() => undefined);

		if (answer?.version && answer.version !== before) return answer.version;
	}

	throw new Error(`ender did not come back as a new version within ${seconds} seconds; open Ender again`);
};

/**
 * Upgrades ender as a job, then asks it to restart as the new binary and reloads the page once that answers, so the
 * page and every job after are the new ender's.
 */
const upgradeEnder = async () => {
	const before = state.upgrade?.current;
	const job = await start('POST', 'upgrade');

	await finished(job, { reloading: false });
	await call('POST', 'restart');
	await servedBy(before);
	window.location.reload();
};

const playerPath = name => `players/${encodeURIComponent(name)}`;

const starPath = entry => `stars/${entry.repo.split('/').map(encodeURIComponent).join('/')}`;

export const local = {
	ready: () => (detected ??= detect().catch(() => false)),
	/** Forgets whether ender web serves the page, so the next ready() asks again. */
	askAgain: () => {
		detected = undefined;
		upgradeAsked = undefined;
	},
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
	/** Turn an optional entry a pack offers on or off, by the key ender lists it under; answers the job that syncs it. */
	setOptional: (name, key, on) => start('POST', `${named(name)}/optional`, { key, on }),
	finished,
	/**
	 * Trust the jars a finished job held back, then install them; answers the job that does. When ender web has nothing
	 * it can run for that, the jars are trusted all the same, and the error it throws says so, marked `trusted`.
	 */
	trustAndRetry: async job => {
		for (const sha256 of heldBack(job)) await call('POST', 'trust', { sha256 });

		try {
			return await start('POST', `jobs/${encodeURIComponent(job.id)}/again`);
		} catch (error) {
			throw Object.assign(error, { trusted: error.status === 409 });
		}
	},
	/** What changed in a held build's scripts, as git prints a diff; undefined when ender cannot say. */
	buildDiff: async ({ key, commit }) =>
		(await call('GET', `builds?${new URLSearchParams({ key, commit })}`)).diff ?? undefined,
	/** Allow the build scripts a finished job was held for, as they were held, then run it again; answers that job. */
	allowBuildsAndRetry: async job => {
		for (const { key, commit } of heldBuilds(job)) await call('POST', 'builds', { key, commit });

		return start('POST', `jobs/${encodeURIComponent(job.id)}/again`);
	},
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
	/** The organizations that GitHub login belongs to, as its own token sees them; none from an ender too old to say. */
	get organizations() {
		return state.organizations;
	},
	get accountError() {
		return state.accountError;
	},
	loadAccount,
	/** ender's accounts as { fallback, accounts }; undefined until it has said, null when it is too old to. */
	get players() {
		return state.players;
	},
	get playersError() {
		return state.playersError;
	},
	loadPlayers,
	/** Asks again, as after a sign in finishes outside these calls. */
	refreshPlayers: () => {
		playersAsked = undefined;

		return loadPlayers();
	},
	addPlayer: name => changePlayers('POST', 'players', { name }),
	usePlayer: name => changePlayers('POST', `${playerPath(name)}/use`),
	removePlayer: name => changePlayers('DELETE', playerPath(name)),
	/** Microsoft's device code sign in, as a job whose lines carry the code to type. */
	signIn: () => start('POST', 'sign-in'),
	get upgrade() {
		return state.upgrade;
	},
	/** Which ender serves the page, where it is installed, where it keeps its data, and whether Terminal has it. */
	get ender() {
		return state.ender;
	},
	/** Asks ender to link Ender.app's ender into a Mac's Terminal, which macOS asks the user's password for, and keeps how Terminal then stands. */
	linkTerminal: async () => {
		state.ender = { ...state.ender, terminal: await call('POST', 'terminal') };
		notify();
	},
	loadUpgrade,
	upgradeEnder,
	/** One instance plays as this player; null returns it to the active one. */
	assignPlayer: async (name, player) => {
		await call('PUT', `${named(name)}/player`, { player });
		await reload();
	},
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
