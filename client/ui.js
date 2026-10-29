import {
	Card,
	Component,
	Dialog,
	Link,
	Notify,
	Toolbar,
	TooltipWrapper,
	copyToClipboard,
	styled,
	theme,
} from '@vanilla-bean/components';

import { local } from './local';
import { REPOSITORY, aboutOf, modPath, pictureUrl, readmeSources, titleOf } from './search';

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
	({ colors }) => `
		color: ${colors.muted};
		font-size: 0.85em;
	`,
);

export const Title = styled.Component(
	() => `
		font-weight: bold;
		font-size: 1.1em;
	`,
);

export const Chip = styled(
	TooltipWrapper,
	({ colors, radius, space }) => `
		border: 1px solid ${colors.border};
		border-radius: ${radius.pill};
		padding: 0 ${space.sm};
		font-size: 0.8em;

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

/**
 * A tooltip for a sentence: one is never scrolled, since it lets the pointer through, so it is given the height its
 * text takes rather than a popover's default.
 */
export const hint = textContent => ({ textContent, maxHeight: 320 });

export const Warning = styled.Component(
	({ colors }) => `
		color: ${colors.warning};
		font-size: 0.9em;
	`,
);

export const Command = styled.Component(
	({ colors, radius, space }) => `
		background: ${colors.overlay};
		border-radius: ${radius.sm};
		padding: ${space.xs} ${space.sm};
		font-size: 0.9em;
		user-select: all;
		overflow-wrap: anywhere;
	`,
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

export const copyCommand = async command => {
	const copied = await copyToClipboard(command);

	new Notify({
		intent: copied ? 'success' : 'warning',
		content: copied ? `Copied ${command}` : 'The clipboard is out of reach here; select the command and copy it',
	});
};

const Stat = styled.Component(
	({ colors, radius, space }) => `
		display: flex;
		flex-direction: column;
		padding: ${space.sm} ${space.md};
		border: 1px solid ${colors.border};
		border-radius: ${radius.md};
		min-width: 7em;

		& > strong {
			font-size: 1.2em;
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

const Places = styled.Component(
	({ colors, media, space }) => `
		display: flex;
		align-items: center;
		gap: ${space.xs};
		margin-left: ${space.md};

		@media ${media.wide} {
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
export const LAUNCHER = '#/get';

/** Where the index tells mod authors what it reads from their repositories, or one part of that. */
export const authorsPath = part => (part ? `#/authors/${part}` : '#/authors');

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
export const forLocal = component => {
	component.elem.style.display = 'none';
	local.ready().then(served => {
		if (served) component.elem.style.display = '';
	});

	return component;
};

const PLACES = {
	mods: { label: 'Mods', href: '#/' },
	packs: { label: 'Packs', href: '#/packs' },
	instances: { label: 'Instances', href: '#/instances', local: true },
};

const Trail = styled.Component(
	({ colors, fontSize, media, space }) => `
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		gap: ${space.xs};
		min-width: 0;
		white-space: nowrap;
		color: ${colors.muted};

		& > .site {
			flex-shrink: 0;
			font-size: ${fontSize.lg};
			font-weight: 600;
			color: inherit;
			text-decoration: none;
		}

		& > .steps {
			display: contents;
		}

		& > .site,
		& [aria-current='page'] {
			color: ${colors.white};
		}

		& [aria-current='page'] {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		@media ${media.wide} {
			max-width: calc(50% - 170px);
		}

		@media ${media.phone} {
			& .between {
				display: none;
			}
		}
	`,
);

/** A page's steps in the bar: each one back a link, the page itself last; only the last shows on a phone. */
export const trailSteps = (...steps) =>
	steps.flatMap((step, at) => {
		const last = at === steps.length - 1;
		const between = last ? {} : { addClass: 'between' };

		return [
			new Component({ tag: 'span', textContent: '/', attributes: { 'aria-hidden': 'true' }, ...between }),
			step.href
				? new Link({ href: step.href, textContent: step.label, ...between })
				: new Component({
						tag: 'span',
						textContent: step.label,
						title: step.label,
						attributes: { 'aria-current': 'page' },
					}),
		];
	});

/**
 * Every page's bar: the index's name and where the page is within it, the index's own places with the current one
 * marked and the mods keeping the search they were left with, and on the far side the link that leaves it, to its
 * repository, where GitHub shows how to sponsor it. Given steps, the bar answers trail(...steps) to retell them once
 * the page knows what it shows.
 */
export const siteBar = (at, ...steps) => {
	const shown = new Component({ tag: 'span', addClass: 'steps', append: trailSteps(...steps) });
	const bar = new Toolbar({
		variant: 'bar',
		style: { position: 'relative' },
		append: [
			new Trail({
				tag: 'nav',
				attributes: { 'aria-label': 'Breadcrumb' },
				append: [new Link({ addClass: 'site', href: `${location.search}#/`, textContent: 'ender index' }), shown],
			}),
			new Places({
				tag: 'nav',
				append: Object.entries(PLACES).map(([place, { label, href, local: localOnly }]) => {
					const link = new Link({
						variant: 'flat',
						href: place === 'mods' ? `${location.search}${href}` : href,
						textContent: label,
						...(place === at ? { attributes: { 'aria-current': steps.length > 0 ? 'location' : 'page' } } : {}),
					});

					return localOnly ? forLocal(link) : link;
				}),
			}),
			new Row({
				style: { marginLeft: 'auto', flexWrap: 'nowrap' },
				append: [
					forStrangers(new Link({ variant: 'flat', href: LAUNCHER, textContent: 'Get ender' })),
					new Link({ variant: 'flat', href: REPOSITORY, target: '_blank', textContent: 'GitHub' }),
				],
			}),
		],
	});

	bar.trail = (...retold) => shown.content(trailSteps(...retold));

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
	({ colors }) => `
		color: ${colors.muted};
		font-size: 0.85em;
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
		{ tag: 'a', attributes: { href: `#${modPath(other)}` }, interactive: true },
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
