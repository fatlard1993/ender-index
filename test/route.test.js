import { describe, expect, test } from 'bun:test';

import { sitePages } from '../scripts/buildSite';
import { ROUTES, addressOf, followsHere, hashRoute, hrefOf, routeOf, routeTo } from '../client/route';

const SITE = 'https://fatlard1993.github.io/ender-index/';

describe("the site's pages", () => {
	test('are paths under the base, wherever the site is served', () => {
		expect(routeOf({ pathname: '/ender-index/mod/github/a/b' }, '/ender-index/')).toBe('/mod/github/a/b');
		expect(routeOf({ pathname: '/ender-index/' }, '/ender-index/')).toBe('/');
		expect(routeOf({ pathname: '/packs' }, '/')).toBe('/packs');
		expect(addressOf('/mod/github/a/b', '?mc=26.3', '/ender-index/')).toBe('/ender-index/mod/github/a/b?mc=26.3');
		expect(new URL(hrefOf('/packs'), `https://x.example${'/ender-index/'}`).pathname).toBe('/ender-index/packs');
	});

	test('take an address shared before they were paths to the page it named', () => {
		expect(hashRoute('#/mod/github/fatlard1993/armor-hud')).toBe('/mod/github/fatlard1993/armor-hud');
		expect(hashRoute('#/packs?query=a')).toBe('/packs');
		expect(hashRoute('#top')).toBeUndefined();
		expect(hashRoute('')).toBeUndefined();
	});

	test('follow a press on a link to one of them here, keeping the search, and leave a browser its own presses', () => {
		const press = (change = {}) => ({ button: 0, defaultPrevented: false, ...change });
		const link = (href, attributes = {}) => ({
			href: new URL(href, 'https://x.example/ender-index/').href,
			target: attributes.target ?? '',
			getAttribute: () => href,
			hasAttribute: name => name in attributes,
		});
		const at = { origin: 'https://x.example', search: '?q=hud' };
		const follows = (event, anchor) => followsHere(event, anchor, at, '/ender-index/');

		expect(follows(press(), link('./mod/github/a/b'))).toBe(true);
		expect(follows(press(), link('./?q=hud'))).toBe(true);
		expect(follows(press(), link('./?tag=ship'))).toBe(false);
		expect(follows(press({ ctrlKey: true }), link('./packs'))).toBe(false);
		expect(follows(press({ button: 1 }), link('./packs'))).toBe(false);
		expect(follows(press(), link('./packs', { target: '_blank' }))).toBe(false);
		expect(follows(press(), link('./pack.json', { download: '' }))).toBe(false);
		expect(follows(press(), link('https://github.com/a/b'))).toBe(false);
		expect(follows(press(), link('/elsewhere/'))).toBe(false);
		expect(follows(press(), link('#readme-install'))).toBe(false);
	});
});

describe('the pages GitHub Pages serves', () => {
	const shell = [
		'<title>ender index</title>',
		'<base href="/" />',
		'<meta name="description" content="Minecraft mods." />',
		'</head>',
	].join('\n');
	const mod = {
		repo: 'fatlard1993/armor-hud',
		host: 'github',
		description: 'Your armor beside the hotbar, "shaking" when hit & more.',
		icon: 'abc.png',
		latest: { mods: [{ name: 'Armor HUD' }] },
	};
	const pages = sitePages({
		shell,
		site: SITE,
		mods: [mod, { repo: 'group/sub/odd name', host: 'gitlab' }],
		packs: [
			{ repo: 'a/pack', host: 'github', name: 'A Pack' },
			{ repo: 'abc123', host: 'gist', name: 'Gist' },
		],
	});

	test("name what a mod's link shows, in the tags a chat's preview reads", () => {
		const page = pages.get('mod/github/fatlard1993/armor-hud.html');

		expect(page).toContain('<title>Armor HUD - ender index</title>');
		expect(page).toContain('<base href="/ender-index/" />');
		expect(page).toContain('content="Your armor beside the hotbar, &quot;shaking&quot; when hit &amp; more."');
		expect(page).toContain(`<meta property="og:url" content="${SITE}mod/github/fatlard1993/armor-hud" />`);
		expect(page).toContain(
			'<meta property="og:image" content="https://raw.githubusercontent.com/fatlard1993/ender-index/main/data/icons/abc.png" />',
		);
		expect(pages.get('pack/github/a/pack.html')).toContain('<meta property="og:title" content="A Pack" />');
	});

	test('leave a route with no plain path, and every route listed since, to 404.html, the site as it is', () => {
		expect([...pages.keys()].filter(file => file.includes('odd') || file.includes('gist'))).toEqual([]);
		expect(pages.get('404.html')).toContain('<base href="/ender-index/" />');
		expect(pages.get('404.html')).toContain('<title>ender index</title>');
		expect(pages.has('packs.html')).toBe(true);
	});
});

test("builds every page's route from the one map the router reads, a pack's and a mod's too", async () => {
	const { modPath, packRoute } = await import('../client/search');

	expect(routeTo('pack', { host: 'github', owner: 'me', name: 'family' })).toBe('/pack/github/me/family');
	expect(routeTo('authorsPart', { part: 'funding' })).toBe('/authors/funding');
	expect(packRoute({ repo: 'me/family' })).toBe(routeTo('pack', { host: 'github', owner: 'me', name: 'family' }));
	expect(modPath({ host: 'gitlab', repo: 'group/sub/project' })).toBe('/mod/gitlab/group%2Fsub/project');
	expect(Object.values(ROUTES).every(route => route.startsWith('/'))).toBe(true);
});
