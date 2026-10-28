import { join } from 'node:path';

import { serve, serveStatic } from '@vanilla-bean/components/app';
import { allowed, webApi } from 'ender-launcher/web';

const BUILD = join(import.meta.dir, '..', 'client', 'build');

export const PORT = Number(process.env.PORT ?? 7460);

const ENDER = process.env.ENDER ?? 'ender';

export { SPEC, allowed } from 'ender-launcher/web';

/** The ender on PATH, or ENDER: this server runs the site from its source, beside whatever ender is installed. */
const ender = async args => {
	const child = Bun.spawn([ENDER, ...args], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1' } });
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);

	return { code, output: `${stdout}${stderr}`.trim() };
};

const api = webApi({ run: ender });

/**
 * vbc's serve refuses a write whose origin is not its host, but a name rebound to this address is its own host, and
 * this server runs ender: allowed holds the host to this machine first.
 */
export const handle = async request => {
	if (!allowed(request, PORT)) return new Response('Only a page served from this machine may ask', { status: 403 });

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
