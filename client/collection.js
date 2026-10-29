import { collectionKey } from './search';

const STORAGE_KEY = 'ender-index:collection';

const read = () => {
	try {
		return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
	} catch {
		return [];
	}
};

let items = read();
const listeners = new Set();

const save = () => {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
	} catch {
		// A tab that cannot store keeps the collection for as long as the page is open
	}

	for (const listener of listeners) listener(items);
};

/** The mods gathered in this tab, kept across reloads until the tab closes. */
export const collection = {
	get items() {
		return items;
	},
	has: entry => items.some(item => collectionKey(item) === collectionKey(entry)),
	toggle: (entry, title) => {
		items = collection.has(entry)
			? items.filter(item => collectionKey(item) !== collectionKey(entry))
			: [
					...items,
					{ host: entry.host ?? 'github', repo: entry.repo, title, ...(entry.fromSource ? { fromSource: true } : {}) },
				];
		save();
	},
	clear: () => {
		items = [];
		save();
	},
	/** Calls back on every change until the signal aborts, so a view that is torn down stops listening. */
	subscribe: (listener, signal) => {
		listeners.add(listener);
		signal?.addEventListener('abort', () => listeners.delete(listener));
	},
};
