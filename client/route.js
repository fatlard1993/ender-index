/**
 * Where the site's pages are: under the page's base, which is /ender-index/ on GitHub Pages and / where ender web
 * serves it. A page is a path, not a fragment, so a link to a mod reaches a page of its own that a chat's preview can
 * read.
 */
export const basePath = (base = document.baseURI) => new URL(base).pathname;

/** The page a location names, as the router's routes spell it, a leading slash and no base. */
export const routeOf = ({ pathname }, base = basePath()) =>
	`/${(pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\/+/, '')).replace(/\.html$/, '')}`.replace(
		/\/index$/,
		'/',
	);

/** An address for a route, keeping this search: going from page to page carries the search and its versions along. */
export const addressOf = (route, search = location.search, base = basePath()) =>
	`${base}${route.replace(/^\/+/, '')}${search}`;

/** The route a link of the old kind names, #/mod/..., which an address shared before pages were paths still holds. */
export const hashRoute = hash => (hash.startsWith('#/') ? hash.slice(1).replace(/\?.*$/, '') : undefined);

/** Show a route, as a new step back can return from. */
export const navigate = route => {
	history.pushState(null, '', addressOf(route));
	dispatchEvent(new PopStateEvent('popstate'));
};

/**
 * Whether a press on this link is the page's to follow: one to another of this site's pages that asks nothing a
 * browser has to do itself, and keeps the search, as a link naming none does. A link naming another search loads the
 * page anew, and one to a place on this page is the browser's.
 */
export const followsHere = (event, anchor, { origin, search } = location, base = basePath()) => {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
		return false;
	if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return false;
	if (anchor.getAttribute('href').startsWith('#')) return false;

	const url = new URL(anchor.href);

	if (url.origin !== origin || !url.pathname.startsWith(base)) return false;

	return !anchor.getAttribute('href').includes('?') || url.search === search;
};

/** Follow presses on the site's links here, without loading the page again. */
export const followLinks = () =>
	document.addEventListener('click', event => {
		const anchor = event.target.closest?.('a[href]');

		if (!anchor || !followsHere(event, anchor)) return;

		event.preventDefault();
		navigate(routeOf(new URL(anchor.href)));
	});

/** A link to a route, relative to the base, so it reaches the same page on GitHub Pages and from ender web. */
export const hrefOf = route => `.${route}`;
