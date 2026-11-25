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
						assets: [
							{
								name: 'lithium.jar',
								mods: [{ id: 'lithium', depends: ['fabricloader', 'sodium'] }],
								scan: { capabilities: { network: { 'me/Check.class': ['java/net/http/HttpClient.send'] } } },
							},
						],
					},
				],
			},
			'/mods/copy/client.json': {
				repo: 'copy/client',
				releases: [
					{
						tag: 'v5',
						assets: [
							{
								name: 'client.jar',
								url: 'https://example.invalid/client.jar',
								mods: [mod('sodium', 'Sodium')],
								scan: {
									version: 1,
									capabilities: {
										exec: {
											'META-INF/jars/sqlite-jdbc.jar!org/sqlite/util/OSInfo.class': ['java/lang/ProcessBuilder.start'],
											'x/shadow/org/h2/tools/Server.class': ['java/lang/Runtime.exec'],
										},
									},
									signals: {
										webhook: { 'x/Send.class': ['https://discord.com/api/webhooks/1'] },
										beacon: { 'x/Ping.class': ['a call a newer scanner names'] },
									},
									secrets: { discord: { 'x/Grab.class': ['\\discord\\Local Storage\\leveldb'] } },
									hosts: { '10.0.0.7': ['x/Send.class'] },
									unreadable: [],
								},
							},
							{ name: 'broken.jar', url: 'https://example.invalid/broken.jar', error: 'not a zip' },
							{
								name: 'extra.jar',
								url: 'https://example.invalid/extra.jar',
								mods: [mod('sodium', 'Sodium')],
								unsourced: { count: 1, classes: ['x/Send.class'] },
								knownBad: 'a payload reported and confirmed',
								scan: { version: 3, capabilities: {}, hosts: {}, unreadable: [] },
							},
						],
					},
					{
						tag: 'v4',
						assets: [
							{
								name: 'client-4.jar',
								mods: [mod('sodium', 'Sodium')],
								scan: { capabilities: {}, hosts: {}, unreadable: [] },
							},
						],
					},
				],
			},
			'/explanations.json': {
				'github:copy/client': {
					exec: {
						text: 'It asks the system which platform it is on.',
						by: 'copy',
						release: 'v4',
						covers: { calls: ['java/lang/ProcessBuilder.start'], hosts: [] },
						issue: 'https://github.com/fatlard1993/ender-index/issues/10',
					},
				},
				'github:CaffeineMC/lithium': {
					network: {
						text: 'It asks Modrinth whether a newer version is out.',
						by: 'jellysquid3',
						release: '1.0',
						issue: 'https://github.com/fatlard1993/ender-index/issues/9',
					},
				},
			},
			'/pack-pages/me/family.json': {
				host: 'github',
				repo: 'me/family',
				name: 'Family',
				count: 1,
				matched: [],
				formats: ['ender'],
				install: 'ender import gh:me/family',
				mods: [{ name: 'Sodium', jar: 'modrinth', modrinth: 'sodium' }],
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
		expect(button('talks to the internet').getAttribute('aria-pressed')).toBe('true');
		expect(button('starts other programs').getAttribute('aria-pressed')).toBe('false');

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

test("shows a mod's install command as Code, with Code's own copy button", async () => {
	const page = await mount('');
	const command = [...document.querySelectorAll('code')].find(code =>
		code.textContent.startsWith('ender add gh:CaffeineMC/lithium'),
	);

	expect(command.tagName).toBe('CODE');
	expect(command.classList.contains('language-shell')).toBe(true);
	expect([...command.children].some(child => child.className.includes('fa-copy'))).toBe(true);
	page.destroy();
});

test("heads the search, the index's home, with the index's name and no breadcrumb", async () => {
	const page = await mount('');

	expect(document.querySelector('[role="heading"][aria-level="1"]').textContent).toBe('ender index');
	expect(document.querySelectorAll('nav[aria-label="Breadcrumb"] a')).toHaveLength(0);
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
	test('tells of classes the source does not have, and keeps unread jars in view whatever the filters', async () => {
		document.body.innerHTML = '';
		history.replaceState(null, '', '/ender-index/mod/github/copy/client?mc=1.2.5');

		const { default: ModPage } = await import('../client/ModPage');
		const page = new ModPage({ appendTo: document.body, host: 'github', owner: 'copy', name: 'client' });

		await settle(() => document.body.textContent.includes('Jars the crawl could not read'));

		expect(document.body.textContent).toContain('No jar matches');
		expect(document.body.textContent).toContain('broken.jar, in v5, could not be read or scanned');
		page.destroy();
		history.replaceState(null, '', '/ender-index/');

		document.body.innerHTML = '';

		const again = new ModPage({ appendTo: document.body, host: 'github', owner: 'copy', name: 'client' });

		await settle(() => document.body.textContent.includes('warns of unsourced'));

		expect(document.body.textContent).toContain('x/Send.class: no source for it in the repository at this release');
		expect(document.body.textContent).toContain(
			"This jar is on the index's known-bad list: a payload reported and confirmed. ender will not install it.",
		);
		again.destroy();
	});

	test('says outright when a jar names where other programs keep logins, and lays out every other finding', async () => {
		document.body.innerHTML = '';

		const { default: ModPage } = await import('../client/ModPage');
		const page = new ModPage({ appendTo: document.body, host: 'github', owner: 'copy', name: 'client' });

		await settle(() => document.body.textContent.includes("Discord's login token"));

		const text = document.body.textContent;
		const exec = [...document.querySelectorAll('details')].find(details =>
			details.querySelector('summary')?.textContent.includes('Starts other programs'),
		);

		expect(text).toContain("Its code names where Discord's login token is kept. No mod has a reason to");
		expect(text).toContain('Posts into a chat: normal for a server relaying chat to Discord');
		expect(exec.querySelector('summary').textContent).toStartWith(
			'Unusual Starts other programs: usually to open a folder or a link',
		);
		expect(text).toContain('Unusual: starts other programs · Worth a look: posts into a chat');
		expect(exec.textContent).toContain('only in what look like libraries it bundles');
		expect(exec.textContent).toContain('In sqlite-jdbc.jar, a library it bundles:');
		expect(exec.textContent).toContain('In what looks like org.h2, a library it bundles:');
		expect(exec.textContent).toContain(
			'Written for v4, it does not cover what this jar has since: java/lang/Runtime.exec',
		);
		expect(text).toContain('its author explains starts other programs; not posts into a chat, beacon');
		expect(text).toContain('Worth a look: posts into a chat, beacon');
		expect(text).toContain('Worth a look Beacon');
		expect(text).toContain('10.0.0.7 (an address, not a name)');
		expect(text).toContain(
			"New since v4: starts other programs, posts into a chat, beacon, names Discord's login token",
		);
		expect(text).toContain('broken.jar, in v5, could not be read or scanned');
		expect(text).toContain('Read by scanner version 1');
		expect(document.querySelector('a[href*="template=rescan.yml"]')?.textContent).toBe('Ask for a rescan');
		page.destroy();
	});

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
	test("is headed in its bar by the mod's name, after a breadcrumb of links, and repeats no h1 below", async () => {
		document.body.innerHTML = '';

		const { default: ModPage } = await import('../client/ModPage');
		const page = new ModPage({ appendTo: document.body, host: 'github', owner: 'CaffeineMC', name: 'lithium' });
		const heading = () => document.querySelector('[role="heading"][aria-level="1"]');

		await settle(() => heading()?.textContent === 'Lithium');

		const crumbs = [...document.querySelectorAll('nav[aria-label="Breadcrumb"] a')].map(link => link.textContent);

		expect(crumbs).toEqual(['ender index']);
		expect(document.querySelector('nav[aria-label="Breadcrumb"] [aria-current]')).toBeNull();
		expect(document.querySelector('h1')).toBeNull();
		page.destroy();
	});

	test("shows its author's explanation beside the finding it answers, as theirs and unchecked", async () => {
		document.body.innerHTML = '';

		const { default: ModPage } = await import('../client/ModPage');
		const page = new ModPage({ appendTo: document.body, host: 'github', owner: 'CaffeineMC', name: 'lithium' });
		const finding = () =>
			[...document.querySelectorAll('details')].find(details =>
				details.querySelector('summary')?.textContent.includes('Talks to the internet'),
			);

		await settle(() => finding()?.textContent.includes('It asks Modrinth'));

		expect(finding().textContent).toContain('From its author, jellysquid3, written for 1.0');
		expect(finding().textContent).toContain('Their own words, which the index has not checked.');
		expect(finding().querySelector('a[href$="findings/network"]')?.textContent).toBe('What reaching network means');
		expect(document.body.textContent).toContain('its author explains talks to the internet');
		expect(
			[...document.querySelectorAll('a')].some(link => link.textContent.startsWith('Explain a finding, as its author')),
		).toBe(true);
		page.destroy();
	});
});

describe('the search page before its index arrives', () => {
	test('keeps its loading state when the collection changes meanwhile', async () => {
		const { collection } = await import('../client/collection');

		history.replaceState(null, '', '/ender-index/');
		document.body.innerHTML = '';

		const page = new SearchPage({ appendTo: document.body });

		collection.toggle(listing[0], 'Lithium');

		expect(document.body.textContent).toContain('Loading the index');
		expect(document.body.textContent).not.toContain('No mods match');

		collection.clear();
		page.destroy();
	});
});

describe('the collection bar', () => {
	test('scrolls as a Content, empties the collection at once, and Undo brings every mod back', async () => {
		document.body.innerHTML = '';

		const { default: CollectionBar } = await import('../client/CollectionBar');
		const { collection } = await import('../client/collection');

		collection.clear();
		collection.toggle(listing[0], 'Lithium');
		collection.toggle(listing[2], 'Backpacks');

		const bar = new CollectionBar({ appendTo: document.body });

		expect(bar.elem.className).toContain('Content');
		expect(bar.elem.classList.contains('column')).toBe(true);

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

describe("a pack's page", () => {
	test('says in an EmptyState that it has no readme, and that no mod matches what was typed', async () => {
		document.body.innerHTML = '';

		const { default: PackPage } = await import('../client/PackPage');
		const page = new PackPage({ appendTo: document.body, host: 'github', owner: 'me', name: 'family' });

		await settle(() => document.body.textContent.includes('No readme'));

		const states = () => [...document.querySelectorAll('[class*="EmptyState"]')].map(state => state.textContent);

		expect(states().some(text => text.includes('No readme was found at the root of the repository.'))).toBe(true);

		const filter = document.querySelector('input[aria-label="Filter its mods"]');

		filter.value = 'zzz';
		filter.dispatchEvent(new Event('input', { bubbles: true }));

		expect(states().some(text => text.includes('None of its mods match') && text.includes('"zzz"'))).toBe(true);
		page.destroy();
	});
});

test("closes a page with the index's license and whose work it shows", async () => {
	const { siteFooter } = await import('../client/ui');
	const footer = siteFooter();

	expect(footer.elem.textContent).toContain("The index's code and records are under the MIT license");
	expect(footer.elem.textContent).toContain("A mod's name, description, icon and readme belong to its author");
	expect(footer.elem.querySelector('a[href$="/blob/main/LICENSE"]')?.textContent).toBe('MIT license');
});

describe('a pack page', () => {
	test('a mod the index has not got is a card of what Modrinth says of it, or its name alone when Modrinth said nothing', async () => {
		const { entryCard } = await import('../client/PackPage');
		const mod = {
			name: 'Config Manager',
			file: 'cm.jar',
			source: 'https://github.com/a/cm',
			jar: 'modrinth',
			modrinth: 'configmanager',
		};
		const card = entryCard(mod, {
			project: { title: 'Config Manager', description: 'Keeps your configs', icon: 'https://cdn.example/cm.png' },
		}).elem;
		const links = [...card.querySelectorAll('a')].map(link => [link.textContent, link.getAttribute('href')]);

		expect(card.textContent).toContain('Keeps your configs');
		expect(card.querySelector('img').getAttribute('src')).toBe('https://cdn.example/cm.png');
		expect(links).toEqual([
			['Read more on Modrinth', 'https://modrinth.com/project/configmanager'],
			['Its source', 'https://github.com/a/cm'],
		]);
		expect(entryCard({ name: 'Lone', jar: 'none' }).elem.textContent).toContain('Lone');
	});

	test('a CurseForge mod links its page there, by its number or, for a resource or shader pack, by its kind', async () => {
		const { entryCard } = await import('../client/PackPage');
		const hrefOf = mod => entryCard(mod).elem.querySelector('a')?.getAttribute('href');

		expect(entryCard({ name: 'JEI', jar: 'none', curseforge: '238222' }).elem.querySelector('a').textContent).toBe(
			'Read more on CurseForge',
		);
		expect(hrefOf({ name: 'JEI', jar: 'none', curseforge: '238222' })).toBe(
			'https://www.curseforge.com/projects/238222',
		);
		expect(hrefOf({ name: 'Stay True', kind: 'resourcepacks', jar: 'none', curseforge: 'stay-true' })).toBe(
			'https://www.curseforge.com/minecraft/texture-packs/stay-true',
		);
		expect(hrefOf({ name: 'BSL', kind: 'shaderpacks', jar: 'none', curseforge: 'bsl-shaders' })).toBe(
			'https://www.curseforge.com/minecraft/shaders/bsl-shaders',
		);
	});

	test('says who made a pack, what it pins and asks for, and what it carries beside its mods', async () => {
		const { packByline, packExtras } = await import('../client/PackPage');
		const pack = {
			version: '3',
			author: 'Ada',
			loader: 'fabric',
			loaderVersion: '0.20.1',
			memory: 6144,
			mods: [
				{ name: 'gh:b/named', key: 'github:b/named' },
				{ name: 'Zoomify', optional: true, description: 'Zoom with C' },
			],
			extras: [
				{
					kind: 'shaderpacks',
					name: 'complementary',
					jar: 'modrinth',
					modrinth: 'complementary',
					optional: true,
					default: true,
				},
			],
			servers: [{ name: 'Ours', address: 'play.example.com' }],
		};
		const holder = document.createElement('div');

		for (const part of [...packByline(pack), ...packExtras(pack)]) holder.append(part.elem);

		for (const said of [
			'version 3',
			'by Ada',
			'fabric 0.20.1, pinned',
			'asks for 6 GB of memory',
			'Optional mods (1)',
			'Zoomify',
			'optional, off unless turned on',
			'Zoom with C',
			'Resource and shader packs (1)',
			'shader pack',
			'optional, on unless turned off',
			'Servers (1)',
			'play.example.com',
		]) {
			expect(holder.textContent).toContain(said);
		}

		expect(packExtras({ mods: [{ name: 'a' }] })).toEqual([]);

		const published = new Map([
			['complementary', { title: 'Complementary Shaders', description: 'Shading', icon: 'https://cdn.example/c.png' }],
		]);
		const drawn = document.createElement('div');

		for (const part of packExtras(pack, new Map(), published)) drawn.append(part.elem);

		expect(drawn.textContent).toContain('Complementary Shaders');
		expect(drawn.textContent).toContain('Shading');
		expect(drawn.querySelector('img[src="https://cdn.example/c.png"]')).not.toBeNull();
		expect([...drawn.querySelectorAll('a')].map(link => link.textContent)).toContain('Read more on Modrinth');
	});
});

describe("a mod's page on GitHub Pages", () => {
	test("asks for an author's other mods again after a failed answer, and takes a missing file as none", async () => {
		const { authorTiles } = await import('../client/ModPage');
		const real = globalThis.fetch;
		const answers = [new Response('', { status: 503 }), Response.json([{ repo: 'flaky/one' }])];
		let asked = 0;

		globalThis.fetch = async () => {
			asked += 1;

			return answers.shift() ?? new Response('', { status: 404 });
		};

		try {
			expect(await authorTiles('github:flaky')).toEqual([]);
			expect(await authorTiles('github:flaky')).toEqual([{ repo: 'flaky/one' }]);
			expect(await authorTiles('github:flaky')).toEqual([{ repo: 'flaky/one' }]);
			expect(asked).toBe(2);
			expect(await authorTiles('github:lonely')).toEqual([]);
			expect(await authorTiles('github:lonely')).toEqual([]);
			expect(asked).toBe(3);
		} finally {
			globalThis.fetch = real;
		}
	});

	// A mod listed since the listing the page read: only its own data can show it
	const fresh = entry('new/mod', [mod('newmod', 'New Mod')], {
		description: 'Brand new',
		stars: 3,
		needs: ['github:CaffeineMC/lithium'],
	});
	const record = { repo: 'new/mod', releases: [] };
	const serving = (pages = {}) => {
		const real = globalThis.fetch;
		const asked = [];

		globalThis.fetch = async (request, options) => {
			const address = String(request?.url ?? request);

			asked.push(address);

			if (address.endsWith('/mods/new/mod.json')) return Response.json(record);

			const page = Object.entries(pages).find(([ending]) => address.endsWith(ending));

			return page ? new Response(page[1]) : real(request, options);
		};

		return { asked, restore: () => (globalThis.fetch = real) };
	};
	const open = async () => {
		const { default: ModPage } = await import('../client/ModPage');

		document.body.innerHTML = '';

		const page = new ModPage({ appendTo: document.body, host: 'github', owner: 'new', name: 'mod' });

		await settle(() => /Brand new|is not in the index/.test(document.body.textContent));

		const text = document.body.textContent;

		page.destroy();

		return text;
	};

	test('shows a mod from the data its page carries, with no listing to find it in', async () => {
		const { pageDataOf, pageDataScript } = await import('../client/pageData');
		const network = serving();

		document.head.insertAdjacentHTML('beforeend', pageDataScript(pageDataOf(fresh, [...listing, fresh])));

		try {
			const text = await open();

			expect(text).toContain('Brand new');
			expect(text).toContain('What it needs');
			expect(text).not.toContain('is not in the index');
		} finally {
			network.restore();
			document.getElementById('mod-page').remove();
		}
	});

	test("opened from another page, reads the mod's data from its own page, and the listing where it has none", async () => {
		const { pageDataOf, pageDataScript } = await import('../client/pageData');
		const html = `<html><head>${pageDataScript(pageDataOf(fresh, [...listing, fresh]))}</head><body></body></html>`;
		let network = serving({ '/mod/github/new/mod': html });

		try {
			expect(await open()).toContain('Brand new');
			expect(network.asked.some(address => address.endsWith('/mod/github/new/mod'))).toBe(true);
		} finally {
			network.restore();
		}

		// ender web and a local build serve no such page: the listing, as before, which has not got it
		network = serving();

		try {
			expect(await open()).toContain('new/mod is not in the index');
		} finally {
			network.restore();
		}
	});
});
