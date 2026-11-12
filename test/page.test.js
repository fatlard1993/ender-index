import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { browser } from './dom';

const mod = (id, name, extra) => ({ loader: 'fabric', id, name, minecraft: '~26.3', environment: '*', ...extra });

const entry = (repo, mods, extra) => ({
	repo,
	host: 'github',
	stars: 1,
	description: '',
	targets: mods.map(({ loader, minecraft }) => ({ loader, minecraft })),
	latest: { tag: '1.0', published: '2026-10-01T00:00:00Z', mods, provides: [], capabilities: [] },
	...extra,
});

const listing = [
	entry('CaffeineMC/lithium', [mod('lithium', 'Lithium')], {
		stars: 2192,
		description: 'Performance',
		funding: [{ platform: 'ko_fi', url: 'https://ko-fi.com/lithium' }],
	}),
	entry('copy/client', [mod('sodium', 'Sodium')], {
		stars: 0,
		latest: { tag: 'v5', mods: [mod('sodium', 'Sodium')], provides: [], capabilities: ['network'] },
	}),
	entry('a/backpacks', [mod('backpacks', 'Backpacks', { environment: 'client' })], {
		stars: 60,
		environment: 'client',
	}),
];

const settle = async (until, tries = 50) => {
	for (let tried = 0; tried < tries && !until(); ++tried) await new Promise(resolve => setTimeout(resolve, 20));
};

let restore;
let SearchPage;

beforeAll(async () => {
	restore = browser({
		responses: {
			'/search.json': listing,
			'version_manifest_v2.json': { versions: [{ id: '26.3', type: 'release' }] },
			'/mods/CaffeineMC/lithium.json': {
				repo: 'CaffeineMC/lithium',
				license: 'LGPL-3.0',
				created: '2019-07-01T00:00:00Z',
				pushed: '2026-10-20T00:00:00Z',
				readme: 'README.md',
				releases: [
					{
						tag: '1.0',
						assets: [{ name: 'lithium.jar', mods: [{ id: 'lithium', depends: ['fabricloader', 'sodium'] }] }],
					},
				],
			},
			'CaffeineMC/lithium/HEAD/README.md': '![shields](https://img.shields.io/x) A mod.\n\n![The farm](docs/farm.png)',
		},
	});
	({ default: SearchPage } = await import('../client/SearchPage'));
});

afterAll(() => restore());

const mount = async search => {
	history.replaceState(null, '', `/ender-index/${search}`);
	document.body.innerHTML = '';

	const page = new SearchPage({ appendTo: document.body });

	await settle(
		() =>
			document.querySelectorAll('.card, [class*="Card"]').length > 0 ||
			document.body.textContent.includes('No mods match'),
	);

	return page;
};

describe('the search page', () => {
	test('lists everything, the most relied on first, before anything is typed', async () => {
		const page = await mount('');
		const text = document.body.textContent;

		expect(text).toContain('3 of 3 indexed repositories, most relied on first');
		expect(text.indexOf('Lithium')).toBeLessThan(text.indexOf('Backpacks'));
		page.destroy();
	});

	test('opens a card in place to show its pictures, dates and needs, and closes it again', async () => {
		const page = await mount('');
		const card = [...document.querySelectorAll('[class*="Card"]')].find(found => found.textContent.includes('Lithium'));

		card.querySelector('p').click();
		await settle(() => card.textContent.includes('Everything about Lithium'));

		expect([...card.querySelectorAll('img')].map(img => img.getAttribute('src'))).toContain(
			'https://raw.githubusercontent.com/CaffeineMC/lithium/HEAD/docs/farm.png',
		);
		expect(card.textContent).toContain('LGPL-3.0');
		expect(card.textContent).toContain('Needs');
		expect(card.textContent).toContain('sodium');

		const toggle = [...card.querySelectorAll('button')].find(button => button.textContent.includes('Hide details'));

		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		toggle.click();
		await settle(() => toggle.textContent.includes('Show details'));
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		page.destroy();
	});

	test('says when the mod a search names is claimed by nothing established', async () => {
		const page = await mount('?q=sodium');

		const caution = [...document.querySelectorAll('.finding')].find(chip => chip.textContent.startsWith('few stars'));

		expect(caution.querySelector('.tooltip').textContent).toContain(
			'no repository with 50 stars or more declares "Sodium"',
		);
		expect(document.body.textContent).toContain('ender add gh:copy/client');
		page.destroy();
	});

	test('narrows by what the address asks for, and writes back what is chosen', async () => {
		const page = await mount('?side=client');

		expect(document.body.textContent).toContain('1 of 3 indexed repositories');
		expect(document.body.textContent).toContain('Backpacks');
		expect(location.search).toBe('?side=client');
		page.destroy();
	});

	test('shows each filter chip and Collect as pressed or not, from what they toggle', async () => {
		const page = await mount('?support=1&avoid=network');
		const button = label =>
			[...document.querySelectorAll('button')].find(found => found.textContent.trim().startsWith(label));

		expect(button('Takes support').getAttribute('aria-pressed')).toBe('true');
		expect(button('network').getAttribute('aria-pressed')).toBe('true');
		expect(button('exec').getAttribute('aria-pressed')).toBe('false');

		button('Takes support').click();
		expect(button('Takes support').getAttribute('aria-pressed')).toBe('false');
		expect(button('Takes support').classList.contains('selected')).toBe(false);
		page.destroy();

		const { collectButton } = await import('../client/controls');
		const { collection } = await import('../client/collection');
		const lithium = listing[0];

		expect(collectButton(lithium).elem.getAttribute('aria-pressed')).toBe('false');
		collection.toggle(lithium, 'Lithium');
		expect(collectButton(lithium).elem.getAttribute('aria-pressed')).toBe('true');
		expect(collectButton(lithium).elem.className).not.toContain('intent-success');
		collection.clear();
	});

	test('gives a support link its heart through the icon option, not an Icon appended inside it', async () => {
		const page = await mount('');
		const support = [...document.querySelectorAll('a')].find(
			link => link.getAttribute('href') === 'https://ko-fi.com/lithium',
		);

		expect(support.textContent).toStartWith('Support');
		expect(support.className).toContain('fa-heart');
		expect([...support.children].some(child => child.classList.contains('fa-heart'))).toBe(false);
		page.destroy();
	});
});

test("names the phone's filters button by what pressing it does, with how many filters are on", async () => {
	const page = await mount('?side=client');
	const fold = [...document.querySelectorAll('button')].find(button => button.textContent.includes('filters'));

	expect(fold.textContent.trim()).toBe('Show filters (1)');
	fold.click();
	expect(fold.textContent.trim()).toBe('Hide filters (1)');
	page.destroy();
});

describe('pages that send the visitor somewhere', () => {
	test("offer Get ender's downloads as links to the files, not buttons that set the location", async () => {
		document.body.innerHTML = '';

		const { default: GetPage } = await import('../client/GetPage');
		const page = new GetPage({ appendTo: document.body });
		const downloads = [...document.querySelectorAll('a')].filter(link =>
			link.getAttribute('href')?.startsWith('https://github.com/fatlard1993/ender-launcher/releases/latest/download/'),
		);

		expect(downloads.map(link => link.getAttribute('href').split('/').at(-1))).toEqual([
			'Ender-mac-arm64.dmg',
			'Ender-mac-x64.dmg',
			'Ender-Setup.exe',
		]);
		expect(downloads.every(link => link.className.includes('variant-button'))).toBe(true);
		page.destroy();
	});

	test('lead from a pack the index does not list to every pack by a link', async () => {
		document.body.innerHTML = '';

		const { default: PackPage } = await import('../client/PackPage');
		const page = new PackPage({ appendTo: document.body, host: 'github', owner: 'no', name: 'pack' });

		await settle(() => document.body.textContent.includes('is not a pack the index lists'));

		const every = [...document.querySelectorAll('a')].find(link => link.textContent.trim().startsWith('Every pack'));

		expect(every.getAttribute('href')).toBe('./packs');
		page.destroy();
	});
});

describe("a mod's page", () => {
	test('opens a picture of the gallery large when it is pressed, rather than following its link', async () => {
		document.body.innerHTML = '';

		const { default: ModPage } = await import('../client/ModPage');
		const page = new ModPage({ appendTo: document.body, host: 'github', owner: 'CaffeineMC', name: 'lithium' });
		const picture = () =>
			[...document.querySelectorAll('a')].find(
				link => link.getAttribute('href') === 'https://raw.githubusercontent.com/CaffeineMC/lithium/HEAD/docs/farm.png',
			);

		await settle(() => picture() !== undefined);

		const pressed = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });

		picture().dispatchEvent(pressed);

		expect(pressed.defaultPrevented).toBe(true);
		expect(document.querySelector('dialog')?.textContent).toContain('Open the file');
		document.querySelector('dialog')?.remove();
		page.destroy();
	});
});

describe('the collection bar', () => {
	test('empties the collection at once, and Undo brings every mod back', async () => {
		document.body.innerHTML = '';

		const { default: CollectionBar } = await import('../client/CollectionBar');
		const { collection } = await import('../client/collection');

		collection.clear();
		collection.toggle(listing[0], 'Lithium');
		collection.toggle(listing[2], 'Backpacks');

		const bar = new CollectionBar({ appendTo: document.body });

		[...bar.elem.querySelectorAll('button')].find(button => button.className.includes('fa-trash')).click();
		expect(collection.items).toEqual([]);

		const undo = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Undo');

		expect(undo.closest('.notify, [class*="Notify"]').textContent).toContain('Emptied the collection of 2 mods');
		undo.click();
		expect(collection.items.map(item => item.repo)).toEqual(['CaffeineMC/lithium', 'a/backpacks']);
		collection.clear();
		bar.destroy();
	});
});
