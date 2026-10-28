import { imageType, issueOf, shotFrom } from '../src/shot.js';

/** The largest image taken: the site sends a shot re-encoded at most 1920 wide, which lands well under this. */
export const IMAGE_LARGEST = 3 * 1024 * 1024;

const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const answer = (status, body, origin) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
		},
	});

const base64 = bytes => {
	let binary = '';

	for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));

	return btoa(binary);
};

const github =
	(env, fetcher) =>
	async (path, init = {}) => {
		const response = await fetcher(`https://api.github.com/repos/${env.QUEUE}${path}`, {
			...init,
			headers: {
				accept: 'application/vnd.github+json',
				authorization: `Bearer ${env.GITHUB_TOKEN}`,
				'user-agent': 'ender-shots',
				...(init.body ? { 'content-type': 'application/json' } : {}),
			},
		});

		if (!response.ok) throw new Error(`GitHub answered ${path} with ${response.status}`);

		return response.json();
	};

/**
 * File a shot into the private queue: its image on a branch of its own, which turning it down deletes, and an issue a
 * reviewer labels or closes. The sender learns nothing of where it went, so the queue cannot serve as their image host.
 */
const queue = async ({ shot, bytes, type }, env, fetcher) => {
	const request = github(env, fetcher);
	const id = crypto.randomUUID();
	const branch = `shot/${id}`;
	const file = `${id}.${type}`;
	const { object } = await request('/git/ref/heads/main');

	await request('/git/refs', {
		method: 'POST',
		body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: object.sha }),
	});
	await request(`/contents/${file}`, {
		method: 'PUT',
		body: JSON.stringify({ message: `A shot of ${shot.mods[0]}`, content: base64(bytes), branch }),
	});

	const issue = issueOf(
		{ id, image: file, ...shot, at: new Date().toISOString() },
		`https://github.com/${env.QUEUE}/blob/${branch}/${file}?raw=true`,
	);

	await request('/issues', { method: 'POST', body: JSON.stringify(issue) });
};

const human = async (token, ip, env, fetcher) => {
	const form = new FormData();

	form.append('secret', env.TURNSTILE_SECRET);
	form.append('response', token ?? '');
	if (ip) form.append('remoteip', ip);

	return (await (await fetcher(TURNSTILE, { method: 'POST', body: form })).json()).success === true;
};

export const handle = async (request, env, fetcher = fetch) => {
	const origins = env.ORIGINS.split(',');
	const origin = request.headers.get('origin');
	const allowed = origins.includes(origin) ? origin : undefined;

	if (request.method === 'OPTIONS') {
		return new Response(undefined, {
			status: allowed ? 204 : 403,
			headers: allowed
				? { 'access-control-allow-origin': allowed, 'access-control-allow-methods': 'POST', vary: 'origin' }
				: {},
		});
	}

	if (new URL(request.url).pathname !== '/shots' || request.method !== 'POST')
		return answer(404, { problem: 'Shots are sent with POST /shots' }, allowed);
	if (!allowed) return answer(403, { problem: 'Shots are sent from the index' });

	const ip = request.headers.get('cf-connecting-ip') ?? '';

	if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success)
		return answer(429, { problem: 'That is a lot of shots at once; try again in a minute' }, allowed);

	const form = await request.formData().catch(() => undefined);

	if (form === undefined) return answer(400, { problem: 'A shot is sent as a form' }, allowed);
	if (!(await human(form.get('cf-turnstile-response'), ip, env, fetcher)))
		return answer(403, { problem: 'The check that a person sent this did not pass; try again' }, allowed);

	const image = form.get('image');

	if (!(image instanceof File)) return answer(400, { problem: 'A shot needs its picture' }, allowed);
	if (image.size > IMAGE_LARGEST)
		return answer(413, { problem: `A picture is at most ${IMAGE_LARGEST / 1024 / 1024} MB` }, allowed);

	const bytes = new Uint8Array(await image.arrayBuffer());
	const type = imageType(bytes);

	if (type === undefined) return answer(415, { problem: 'A picture is a PNG, JPEG or WebP' }, allowed);

	const { shot, problem } = shotFrom({ story: form.get('story'), name: form.get('name'), mods: form.getAll('mods') });

	if (problem) return answer(400, { problem }, allowed);

	try {
		await queue({ shot, bytes, type }, env, fetcher);
	} catch (error) {
		console.error(error);

		return answer(502, { problem: 'The shot could not be filed for review; try again later' }, allowed);
	}

	return answer(202, { queued: true }, allowed);
};

export default { fetch: (request, env) => handle(request, env) };
