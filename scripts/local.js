import { join } from 'node:path';

import { requestMatch, serve, serveStatic } from '@vanilla-bean/components/app';

const BUILD = join(import.meta.dir, '..', 'client', 'build');

export const PORT = Number(process.env.PORT ?? 7460);

const ENDER = process.env.ENDER ?? 'ender';

/**
 * What the page may ask ender to add or drop: a repository or a project by the prefixes search writes. A path or a url
 * is refused, because then any page that reached this server could put any jar in an instance.
 */
export const SPEC = /^(gh|cb|gl|mr|cf):[\w-][\w.-]*(\/[\w-][\w.-]*)*$/;

const INSTANCE = /^[\w-][\w.-]*$/;

/**
 * A request this server answers. It runs ender on this machine, so only a page served from here may ask: another
 * site's page fails the origin check, and a name rebound to this address fails the host check.
 */
export const allowed = (request, port = PORT) => {
	const local = [`localhost:${port}`, `127.0.0.1:${port}`];

	if (!local.includes(request.headers.get('host'))) return false;

	if (request.method === 'GET') return true;

	return local.map(host => `http://${host}`).includes(request.headers.get('origin'));
};

const ender = async args => {
	const child = Bun.spawn([ENDER, ...args], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1' } });
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);

	return { code, output: `${stdout}${stderr}`.trim() };
};

const json = (body, status = 200) => Response.json(body, { status });

const enderJson = async args => {
	const { code, output } = await ender(args);

	if (code !== 0) return json({ error: output || `ender ${args[0]} failed` }, 502);

	return json(JSON.parse(output));
};

const change = async (request, name, verb) => {
	const { specs } = await request.json().catch(() => ({}));

	if (!Array.isArray(specs) || specs.length === 0 || !specs.every(spec => SPEC.test(spec))) {
		return json({ error: 'Each mod has to be a spec search writes, such as gh:owner/repo' }, 400);
	}

	const { code, output } = await ender([verb, ...specs, '--instance', name]);

	return json({ ok: code === 0, output }, code === 0 ? 200 : 502);
};

const notAnInstance = () => json({ error: 'Not an instance name' }, 400);

const api = async request => {
	if (requestMatch('GET', '/api/instances', request)) return enderJson(['ls', '--json']);

	const shown = requestMatch('GET', '/api/instances/:name', request);

	if (shown) return INSTANCE.test(shown.name) ? enderJson(['info', shown.name, '--json']) : notAnInstance();

	for (const verb of ['add', 'drop']) {
		const asked = requestMatch('POST', `/api/instances/:name/${verb}`, request);

		if (asked) return INSTANCE.test(asked.name) ? change(request, asked.name, verb) : notAnInstance();
	}

	if (new URL(request.url).pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
};

/**
 * vbc's serve refuses a write whose origin is not its host, but a name rebound to this address is its own host, and
 * this server runs ender: allowed holds the host to this machine first.
 */
export const handle = async request => {
	if (!allowed(request)) return new Response('Only a page served from this machine may ask', { status: 403 });

	return (
		(await api(request)) ?? (await serveStatic(request, { root: BUILD })) ?? new Response('Not found', { status: 404 })
	);
};

if (import.meta.main) {
	const { code, output } = await ender(['ls', '--json']);

	if (code !== 0) {
		console.error(
			`ender did not list its instances as JSON (${output || `is "${ENDER}" on PATH?`}). An ender older than ls --json cannot be managed from here; update it and run this again.`,
		);
		process.exit(1);
	}

	await serve({ hostname: '127.0.0.1', port: PORT, router: handle, build: { publicPath: '' } });

	console.log(`The index, managing this machine's instances, is at http://localhost:${PORT}`);
}
