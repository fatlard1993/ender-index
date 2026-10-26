import { join, normalize } from 'node:path';

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

export const handle = async request => {
	if (!allowed(request)) return new Response('Only a page served from this machine may ask', { status: 403 });

	const { pathname } = new URL(request.url);
	const [, api, resource, name, action] = pathname.split('/');

	if (api === 'api') {
		if (resource !== 'instances') return json({ error: 'Not found' }, 404);

		if (name === undefined) return enderJson(['ls', '--json']);

		if (!INSTANCE.test(name)) return json({ error: 'Not an instance name' }, 400);

		if (request.method === 'GET' && action === undefined) return enderJson(['info', name, '--json']);

		if (request.method === 'POST' && (action === 'add' || action === 'drop')) return change(request, name, action);

		return json({ error: 'Not found' }, 404);
	}

	const path = normalize(join(BUILD, pathname.endsWith('/') ? `${pathname}index.html` : pathname));
	const file = Bun.file(path);

	if (!path.startsWith(BUILD) || !(await file.exists())) return new Response('Not found', { status: 404 });

	return new Response(file);
};

if (import.meta.main) {
	const { code, output } = await ender(['ls', '--json']);

	if (code !== 0) {
		console.error(
			`ender did not list its instances as JSON (${output || `is "${ENDER}" on PATH?`}). An ender older than ls --json cannot be managed from here; update it and run this again.`,
		);
		process.exit(1);
	}

	Bun.serve({ hostname: '127.0.0.1', port: PORT, fetch: handle });

	console.log(`The index, managing this machine's instances, is at http://localhost:${PORT}`);
}
