import { Card, Code, Component, Dialog, Link, Toolbar, TooltipWrapper, styled, theme } from '@vanilla-bean/components';

import { local, updateReady } from './local';
import { REPOSITORY, aboutOf, modPath, pictureUrl, readmeSources, titleOf } from './search';
import { ROUTES, hrefOf, routeTo } from './route';

export const count = number => number.toLocaleString('en-US');

export const date = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '');

export const Stack = styled.Component(
	({ space }) => `
		display: flex;
		flex-direction: column;
		gap: ${space.md};
	`,
);

export const Row = styled.Component(
	({ space }) => `
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: ${space.sm};
	`,
);

export const Meta = styled.Component(
	({ colors, fontSize }) => `
		color: ${colors.muted};
		font-size: ${fontSize.sm};
	`,
);

export const Title = styled.Component(
	({ fontSize }) => `
		font-weight: bold;
		font-size: ${fontSize.lg};
	`,
);

export const Chip = styled(
	TooltipWrapper,
	({ colors, fontSize, radius, space }) => `
		border: 1px solid ${colors.border};
		border-radius: ${radius.pill};
		padding: 0 ${space.sm};
		font-size: ${fontSize.sm};

		&.finding {
			border-color: ${colors.alpha(colors.warning, 0.6)};
			color: ${colors.warning};
		}

		&.installed {
			border-color: ${colors.alpha(colors.success, 0.6)};
			color: ${colors.success};
		}
	`,
);

export const Warning = styled.Component(
	({ colors, fontSize }) => `
		color: ${colors.warning};
		font-size: ${fontSize.sm};
	`,
);

/**
 * A command, a path or a code shown on the page: Code, on the overlay. One line is inline code, its copy button kept at
 * the end of the text however the text wraps.
 */
export const Command = styled(
	Code,
	({ colors, fontSize, radius, space }) => `
		background: ${colors.overlay};
		border-radius: ${radius.sm};
		padding: ${space.xs} ${space.sm};
		font-size: ${fontSize.sm};
		min-width: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;

		&:not(pre) {
			display: inline-flex;
			align-items: center;
			gap: ${space.xs};
			max-width: 100%;
			vertical-align: middle;

			& > button {
				flex: none;
			}
		}
	`,
	{ language: 'shell' },
);

/** A repository's picture, or a cube where its host has none to give without a request. */
export const Avatar = styled.Component(
	({ colors, radius }) => `
		flex: none;
		border-radius: ${radius.md};
		background: ${colors.raised};
		object-fit: cover;
	`,
);

export const avatar = (url, size = 48) => {
	const picture = new Avatar({
		tag: url ? 'img' : 'div',
		...(url ? { attributes: { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } } : {}),
		style: { width: `${size}px`, height: `${size}px` },
	});

	// Mod icons are mostly pixel art, which smoothing blurs when it is drawn larger than it was made
	picture.elem.addEventListener('load', () => {
		if (picture.elem.naturalWidth < size) picture.elem.style.imageRendering = 'pixelated';
	});

	return picture;
};

export const loadJson = async (url, signal) => {
	const response = await fetch(url, { signal });

	if (!response.ok) throw new Error(`${url} answered ${response.status}`);

	return response.json();
};

/** A repository's readme and where its relative links lead, or undefined when none of its candidates loads. */
export const fetchReadme = async (entry, readme, signal) => {
	const sources = readmeSources(entry, readme);

	for (const candidate of sources.candidates) {
		const response = await fetch(candidate, { signal }).catch(error => {
			if (error.name === 'AbortError') throw error;
		});

		if (response?.ok) return { markdown: await response.text(), sources };
	}

	return undefined;
};

const Stat = styled.Component(
	({ colors, fontSize, radius, space }) => `
		display: flex;
		flex-direction: column;
		padding: ${space.sm} ${space.md};
		border: 1px solid ${colors.border};
		border-radius: ${radius.md};
		min-width: 7em;

		& > strong {
			font-size: ${fontSize.xl};
		}
	`,
);

export const stat = (value, label) =>
	new Stat({ append: [new Component({ tag: 'strong', textContent: value }), label] });

export const paragraph = textContent => new Component({ tag: 'p', textContent, style: { margin: 0 } });

/** A repository's own description, or its summary marked with where it came from. */
export const about = found =>
	found === undefined
		? []
		: [
				new Component({
					tag: 'p',
					style: { margin: 0 },
					append: [found.text, ...(found.from ? [new Meta({ tag: 'span', textContent: ` (${found.from})` })] : [])],
				}),
			];

/**
 * Wide enough for the bar to hold the page's name on its one line, beside the breadcrumb, with the index's places in
 * the middle; narrower, the name takes a line of its own when it doesn't fit, as on a phone.
 */
const BAR_WIDE = '(min-width: 900px)';

const Places = styled.Component(
	({ colors, space }) => `
		display: flex;
		align-items: center;
		gap: ${space.xs};
		margin-left: ${space.md};

		@media ${BAR_WIDE} {
			position: absolute;
			left: 50%;
			transform: translateX(-50%);
			margin-left: 0;
		}

		& > a[aria-current] {
			color: ${colors.white};
			text-decoration: underline;
			text-underline-offset: 4px;
		}
	`,
);

/** Where the index says how to get ender, the launcher that installs what it lists. */
export const LAUNCHER = hrefOf(ROUTES.get);

/** Where the index tells mod authors what it reads from their repositories, or one part of that. */
export const authorsPath = part => hrefOf(part ? routeTo('authorsPart', { part }) : ROUTES.authors);

/**
 * Shown only on a page ender is not serving: there it is the launcher's own, and the way to get ender is no news.
 * Hidden until that is known, so it does not show and vanish.
 */
export const forStrangers = component => {
	component.elem.style.display = 'none';
	local.ready().then(served => {
		if (!served) component.elem.style.display = '';
	});

	return component;
};

/** Shown only when ender serves the page: what only this machine's ender can do. */
/** A dot on the link to Settings once a newer ender is out, so the update is found without going looking. */
const markWhenUpdateReady = link => {
	local.ready().then(async served => {
		if (!served) return;

		await local.loadUpgrade();

		if (!updateReady(local.upgrade)) return;

		link.elem.textContent = `${link.elem.textContent} \u2022`;
		link.elem.title = `ender ${local.upgrade.latest} is out`;
	});
};

export const forLocal = component => {
	component.elem.style.display = 'none';
	local.ready().then(served => {
		if (served) component.elem.style.display = '';
	});

	return component;
};

const PLACES = {
	mods: { label: 'Mods', href: hrefOf(ROUTES.mods) },
	packs: { label: 'Packs', href: hrefOf(ROUTES.packs) },
	instances: { label: 'Instances', href: hrefOf(ROUTES.instances), local: true },
	settings: { label: 'Settings', href: hrefOf(ROUTES.settings), local: true, marked: true },
};

/** The bar's breadcrumb: the views above this one, each a link, before the bar's heading; only the site shows on a phone. */
const Trail = styled.Component(
	({ colors, fontSize, media, space }) => `
		flex: 0 1 auto;
		display: flex;
		align-items: center;
		gap: ${space.xs};
		min-width: 0;
		white-space: nowrap;
		color: ${colors.muted};

		&:empty {
			display: none;
		}

		& > .site {
			flex-shrink: 0;
			font-size: ${fontSize.lg};
			font-weight: 600;
			color: ${colors.white};
			text-decoration: none;
		}

		@media ${BAR_WIDE} {
			max-width: 25%;
		}

		@media ${media.phone} {
			& .between {
				display: none;
			}
		}
	`,
);

/**
 * The bar's heading, the view's own name, leaves the middle of a wide bar to the index's places: the far side holds
 * the half beside them, and the heading takes what the breadcrumb leaves before them, from nothing, so a long name is
 * cut short rather than wrapping the bar. A narrower bar wraps a name that doesn't fit onto a line of its own.
 */
const SiteToolbar = styled(
	Toolbar,
	({ space }) => `
		& > .heading {
			flex: 0 1 auto;
			margin-left: ${space.xs};
		}

		@media ${BAR_WIDE} {
			& > .heading {
				flex: 1 1 0;
			}

			& > .end {
				flex: 0 0 calc(50% + 170px);
				justify-content: flex-end;
			}
		}
	`,
);

/** The views above a page, each a link and a slash, the site first; the page itself is the bar's heading. */
export const trailSteps = (...above) =>
	above.flatMap((step, at) => {
		const between = at === 0 ? {} : { addClass: 'between' };

		return [
			new Link({ href: step.href, textContent: step.label, tooltip: false, ...between, ...step.options }),
			new Component({ tag: 'span', textContent: '/', attributes: { 'aria-hidden': 'true' }, ...between }),
		];
	});

/**
 * Every page's bar: the views above the page as links, the page's own name as the bar's heading, the index's own
 * places with the current one marked and the mods keeping the search they were left with, and on the far side the
 * link that leaves it, to its repository, where GitHub shows how to sponsor it. The search, the index's home, is
 * headed with the index's name. Given steps, the bar answers trail(...steps) to retell them once the page knows what
 * it shows.
 */
export const siteBar = (at, ...steps) => {
	const trail = new Trail({ tag: 'nav', addClass: 'start', attributes: { 'aria-label': 'Breadcrumb' } });
	const bar = new SiteToolbar({
		variant: 'bar',
		style: { position: 'relative' },
		append: [
			trail,
			new Places({
				tag: 'nav',
				append: Object.entries(PLACES).map(([place, { label, href, local: localOnly, marked }]) => {
					const link = new Link({
						variant: 'flat',
						href: place === 'mods' ? `${href}${location.search}` : href,
						textContent: label,
						tooltip: false,
						...(place === at ? { attributes: { 'aria-current': steps.length > 0 ? 'location' : 'page' } } : {}),
					});

					if (marked) markWhenUpdateReady(link);

					return localOnly ? forLocal(link) : link;
				}),
			}),
			new Row({
				addClass: 'end',
				style: { marginLeft: 'auto', flexWrap: 'nowrap' },
				append: [
					forStrangers(new Link({ variant: 'flat', href: LAUNCHER, textContent: 'Get ender', tooltip: false })),
					new Link({ variant: 'flat', href: REPOSITORY, target: '_blank', textContent: 'GitHub', tooltip: false }),
				],
			}),
		],
	});
	const site = {
		label: 'ender index',
		href: `${hrefOf(ROUTES.mods)}${location.search}`,
		options: { addClass: 'site' },
	};

	bar.trail = (...retold) => {
		const title = retold.at(-1)?.label ?? (at === 'mods' ? undefined : PLACES[at]?.label);

		trail.content(title === undefined ? [] : trailSteps(site, ...retold.slice(0, -1)));
		bar.options.heading = title ?? site.label;
	};
	bar.trail(...steps);

	return bar;
};

const Screenshots = styled.Component(
	({ colors, media, radius, space }) => `
		display: flex;
		gap: ${space.sm};
		overflow-x: auto;
		scroll-snap-type: x proximity;
		padding-bottom: ${space.xs};

		& img {
			display: block;
			height: 180px;
			max-width: 320px;
			object-fit: cover;
			border-radius: ${radius.md};
			background: ${colors.raised};
			scroll-snap-align: start;
		}

		@media ${media.phone} {
			& img {
				height: 140px;
				max-width: 240px;
			}
		}
	`,
);

/** A row of the pictures a readme shows of its mod, each opening at full size; one that does not load is let go. */
export const screenshots = (title, shots) => {
	const strip = new Screenshots({
		append: shots.map(url => {
			const link = new Link({
				href: url,
				target: '_blank',
				attributes: { rel: 'noopener noreferrer' },
				tooltip: 'Open the full picture',
				append: new Component({
					tag: 'img',
					attributes: {
						src: url,
						alt: `A picture from the readme of ${title}`,
						loading: 'lazy',
						referrerpolicy: 'no-referrer',
					},
				}),
			});

			link.elem.querySelector('img').addEventListener('error', () => {
				link.elem.remove();
				if (strip.elem.childElementCount === 0) strip.elem.remove();
			});

			return link;
		}),
	});

	return shots.length > 0 ? [strip] : [];
};

/** Room for a tile per mod, as many to a row as the column fits. */
const Tiles = styled.Component(
	({ space }) => `
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: ${space.sm};
	`,
);

const Clamped = styled.Component(
	({ colors, fontSize }) => `
		color: ${colors.muted};
		font-size: ${fontSize.sm};
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	`,
);

export const TILES = 6;

/** A mod in a few lines, leading to its page. */
const modTile = other =>
	new Card(
		{ tag: 'a', attributes: { href: hrefOf(modPath(other)) }, interactive: true },
		new Row({
			style: { flexWrap: 'nowrap', alignItems: 'flex-start' },
			append: [
				avatar(pictureUrl(other, 80), 40),
				new Stack({
					style: { minWidth: '0', gap: theme.space.xs },
					append: [
						new Title({ textContent: titleOf(other) }),
						...(aboutOf(other) ? [new Clamped({ textContent: aboutOf(other).text })] : []),
						new Meta({ textContent: `${other.repo} · ${count(other.stars ?? 0)} stars` }),
					],
				}),
			],
		}),
	);

/** Up to a row or two of mods, each a tile leading to its page. */
export const tiles = (mods, most = TILES) => new Tiles({ append: mods.slice(0, most).map(modTile) });

const Lightbox = styled.Component(
	({ radius, space }) => `
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${space.sm};

		& > img {
			display: block;
			max-width: 100%;
			max-height: calc(90vh - 180px);
			object-fit: contain;
			border-radius: ${radius.md};
		}
	`,
);

/** Whether a click on a link was a plain one, rather than one asking for a new tab or window. */
export const plainClick = event => event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey;

/**
 * Pictures shown one at a time in a large dialog, from the one pressed: Previous and Next, or the arrow keys, step
 * through them, each with its caption, and a link opens the file itself.
 */
export const lightbox = (title, pictures, start = 0) => {
	let at = start;
	const image = new Component({ tag: 'img', attributes: { referrerpolicy: 'no-referrer' } });
	const caption = new Component({ style: { alignSelf: 'stretch' } });
	const where = new Meta();
	const original = new Link({
		target: '_blank',
		attributes: { rel: 'noopener noreferrer' },
		textContent: 'Open the file',
	});
	const show = () => {
		const picture = pictures[at];

		image.elem.src = picture.url;
		image.elem.alt = picture.alt ?? `A picture of ${title}`;
		caption.content(picture.caption ?? []);
		where.elem.textContent = pictures.length > 1 ? `${at + 1} of ${pictures.length}` : '';
		original.elem.href = picture.url;
	};
	const step = by => {
		at = (at + by + pictures.length) % pictures.length;
		show();
	};
	const keys = event => {
		if (event.key === 'ArrowRight') step(1);
		if (event.key === 'ArrowLeft') step(-1);
	};
	const dialog = new Dialog({
		header: title,
		size: 'large',
		onClose: () => document.removeEventListener('keydown', keys),
		body: new Lightbox({ append: [image, caption, new Row({ append: [where, original] })] }),
		buttons: pictures.length > 1 ? ['Previous', 'Next', 'Close'] : ['Close'],
		onButtonPress: ({ button, closeDialog }) => (button === 'Close' ? closeDialog() : step(button === 'Next' ? 1 : -1)),
	});

	document.addEventListener('keydown', keys);
	show();

	return dialog;
};
