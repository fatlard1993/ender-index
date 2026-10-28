import { MOD_KEY } from '../src/shot';

/** Where shots are sent: the Worker that files them into the private queue. Empty until it is deployed. */
export const SHOTS_WORKER = '';

/** Cloudflare Turnstile's key for this site, which is public; its secret is the Worker's. */
export const TURNSTILE_SITE_KEY = '';

export const sharingOpen = () => Boolean(SHOTS_WORKER && TURNSTILE_SITE_KEY);

/** The longest side a shot is sent at: as large as a page shows it, and small enough to keep in a repository. */
export const SHOT_WIDEST = 1920;

/** Where a shot of these mods is shared from, each named by its index key or by a mod id the page resolves. */
export const sharePath = mods => {
	const params = new URLSearchParams();

	for (const mod of mods) params.append('mod', mod);

	return `?${params}#/share`;
};

/**
 * The mods a share page was opened with: those already chosen, and those offered, which `ender share` fills with the
 * rest of an instance. Keys as they are, and ids for the page to resolve against the listing.
 */
export const askedFor = search => {
	const params = new URLSearchParams(search);
	const split = name => {
		const asked = params.getAll(name).filter(Boolean);

		return { keys: asked.filter(mod => MOD_KEY.test(mod)), ids: asked.filter(mod => !MOD_KEY.test(mod)) };
	};

	return { chosen: split('mod'), offered: split('from') };
};

/** A picture's size scaled down, never up, so its longest side is at most this. */
export const fitWithin = (width, height, most = SHOT_WIDEST) => {
	const scale = Math.min(1, most / Math.max(width, height));

	return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

/**
 * A screenshot re-encoded in the browser before it is sent: a 4K PNG is tens of megabytes, and a WebP of it at the
 * size a page shows is a few hundred kilobytes. JPEG where the browser cannot encode WebP.
 */
export const shrink = async file => {
	const bitmap = await createImageBitmap(file);
	const { width, height } = fitWithin(bitmap.width, bitmap.height);
	const canvas = Object.assign(document.createElement('canvas'), { width, height });

	canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const encode = type => new Promise(resolve => canvas.toBlob(resolve, type, 0.85));
	const webp = await encode('image/webp');

	return webp?.type === 'image/webp' ? webp : encode('image/jpeg');
};

let turnstile;

/** Cloudflare's check that a person is sending, loaded only on the page that sends. */
export const loadTurnstile = () => {
	turnstile ??= new Promise((resolve, reject) => {
		const script = Object.assign(document.createElement('script'), {
			src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
			async: true,
		});

		script.addEventListener('load', () => resolve(window.turnstile));
		script.addEventListener('error', () => {
			turnstile = undefined;
			script.remove();
			reject(new Error('Cloudflare did not answer'));
		});
		document.head.append(script);
	});

	return turnstile;
};

/** Send a shot to be looked over, or throw what the Worker said was wrong with it. */
export const sendShot = async ({ image, story, name, mods, token }) => {
	const form = new FormData();

	form.append('image', image, image.type === 'image/webp' ? 'shot.webp' : 'shot.jpg');
	form.append('story', story);
	form.append('name', name);
	form.append('cf-turnstile-response', token);
	for (const mod of mods) form.append('mods', mod);

	const response = await fetch(`${SHOTS_WORKER}/shots`, { method: 'POST', body: form });

	if (!response.ok) {
		const { problem } = await response.json().catch(() => ({}));

		throw new Error(problem ?? `The shot was not sent: the queue answered ${response.status}`);
	}
};
