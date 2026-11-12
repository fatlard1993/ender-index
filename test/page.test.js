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

		const toggle = [...card.querySelectorAll('button')].find(button => button.textContent.includes('Less'));

		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		toggle.click();
		await settle(() => toggle.textContent.includes('More'));
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
