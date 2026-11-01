import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { LIBRARY_STYLESHEETS, buildClient } from '@vanilla-bean/components/app';

import { aboutOf, modPath, pictureUrl, titleOf } from '../client/search';

const OUT = join(import.meta.dir, '..', 'client', 'build');
const DATA = join(import.meta.dir, '..', 'data');

/**
 * The stylesheets the library's Page links, with the fonts they name, copied beside the page. Pages
 * serves files and nothing else, so what an app server would answer from node_modules is in the build.
 */
export const copyLibraryStylesheets = async (out = OUT) => {
	for (const stylesheet of LIBRARY_STYLESHEETS) {
		const source = Bun.resolveSync(stylesheet, import.meta.dir);
		const css = await Bun.file(source).text();
		const fonts = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(([, url]) => url);

		for (const file of new Set(['', ...fonts].map(url => (url ? join(dirname(stylesheet), url) : stylesheet)))) {
			const from = join(dirname(source), relative(dirname(stylesheet), file));

			await mkdir(dirname(join(out, file)), { recursive: true });
			await Bun.write(join(out, file), Bun.file(from));
		}
	}
};

/**
 * Files the library's styles reach by a path from the page rather than through a stylesheet: the code font is declared
 * in a style the library writes at runtime.
 */
export const LIBRARY_FILES = ['@vanilla-bean/components/FontWithASyntaxHighlighter-Regular.woff2'];

export const copyLibraryFiles = async (out = OUT) => {
	const library = dirname(Bun.resolveSync('@vanilla-bean/components/package.json', import.meta.dir));

	for (const file of LIBRARY_FILES) {
		await mkdir(dirname(join(out, file)), { recursive: true });
		await Bun.write(join(out, file), Bun.file(join(library, relative('@vanilla-bean/components', file))));
	}
};

const attribute = text =>
	String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** A description cut to what a chat's preview shows, at a word. */
const brief = (text, most = 300) => (text.length <= most ? text : `${text.slice(0, most).replace(/\s+\S*$/, '')}...`);

/**
 * The site's page as one route's own: served under `site`, and naming what it shows in the tags a chat or a search
 * engine reads from a link, since neither runs the page's script to see it.
 */
export const pageFor = (shell, site, { route, title, description, image }) => {
	const { pathname } = new URL(site);
	const tags = [
		['og:site_name', 'ender index'],
		['og:type', 'website'],
		['og:url', new URL(route.replace(/^\//, ''), site).href],
		...(title ? [['og:title', title]] : []),
		...(description ? [['og:description', description]] : []),
		...(image ? [['og:image', image]] : []),
	];

	return shell
		.replace(/<base href="[^"]*" \/>/, `<base href="${attribute(pathname)}" />`)
		.replace(/<title>[^<]*<\/title>/, match => (title ? `<title>${attribute(title)} - ender index</title>` : match))
		.replace(/(<meta\s+name="description"\s+content=")[^"]*"/, (match, start) =>
			description ? `${start}${attribute(description)}"` : match,
		)
		.replace(
			'</head>',
			`${tags.map(([property, content]) => `\t<meta property="${property}" content="${attribute(content)}" />`).join('\n')}\n\t<meta name="twitter:card" content="summary" />\n</head>`,
		);
};

/** Where a route's page is in the build: a path with no extension is served from its .html file. */
const fileOf = route => `${route.replace(/^\//, '')}.html`;

/** The plain path a route is at, or undefined when a part of it would have to be escaped to be one. */
const plainRoute = route => (route.split('/').every(part => part === decodeURIComponent(part)) ? route : undefined);

/**
 * Every page the site has a link to, each its own file, for GitHub Pages: it serves files and nothing else, so a mod's
 * link answers with a page naming the mod. A route with no page of its own, as a mod listed since, is answered by
 * 404.html, the site as it is, which shows the route all the same.
 */
export const sitePages = ({ shell, site, mods, packs }) => {
	const pages = new Map([['404.html', pageFor(shell, site, { route: '/' })]]);
	const add = page => {
		const route = plainRoute(page.route);

		if (route) pages.set(fileOf(route), pageFor(shell, site, { ...page, route }));
	};

	pages.set('index.html', pageFor(shell, site, { route: '/' }));

	for (const [route, title] of [
		['/packs', 'Packs'],
		['/get', 'Get ender'],
		['/authors', 'For authors'],
		['/instances', 'Instances'],
		['/mine', 'Your mods'],
	])
		add({ route, title });

	for (const entry of mods)
		add({
			route: modPath(entry),
			title: titleOf(entry),
			description: aboutOf(entry) && brief(aboutOf(entry).text),
			image: pictureUrl(entry, 256),
		});

	for (const pack of packs)
		if (pack.repo.split('/').length === 2)
			add({
				route: `/pack/${pack.host ?? 'github'}/${pack.repo}`,
				title: pack.name,
				description: pack.description && brief(pack.description),
				image: pictureUrl(pack, 256),
			});

	return pages;
};

const writePages = async (site, out = OUT) => {
	const shell = await Bun.file(join(out, 'index.html')).text();
	const read = async file => ((await Bun.file(join(DATA, file)).exists()) ? Bun.file(join(DATA, file)).json() : []);
	const pages = sitePages({ shell, site, mods: await read('search.json'), packs: await read('packs.json') });

	for (const [file, html] of pages) await Bun.write(join(out, file), html);

	return pages.size;
};

if (import.meta.main) {
	const [flag, site] = process.argv.slice(2);

	if (flag !== undefined && (flag !== '--pages' || !URL.canParse(site))) {
		console.error('bun scripts/buildSite.js [--pages <the address the site is served at, as https://x.github.io/y/>]');
		process.exit(2);
	}

	const { success, logs } = await buildClient({ publicPath: '' });

	if (!success) {
		for (const log of logs) console.error(log);

		process.exit(1);
	}

	await copyLibraryStylesheets();
	await copyLibraryFiles();

	console.log(`Built the search page into ${OUT}`);

	if (site) console.log(`Wrote ${await writePages(site)} pages for ${site}, one a mod, pack and place`);
}
