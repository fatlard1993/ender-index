/**
 * Start a workflow when none of its runs began within the last `hours`, as each crawl does for the daily data-squash and
 * data-mirror once it has committed: GitHub drops scheduled runs, and a crawl runs every hour.
 *
 *   bun scripts/startIfDue.js <workflow file> <hours> [--until YYYY-MM-DD]
 *
 * --until names the last day the workflow is wanted on; after it, nothing is started.
 */

/** Whether a workflow last started at `lastStarted`, or never, is due again. */
export const isDue = ({ lastStarted, hours, until, now = Date.now() }) => {
	if (until !== undefined && new Date(now).toISOString().slice(0, 10) > until) return false;
	if (lastStarted === undefined) return true;

	return now - Date.parse(lastStarted) >= hours * 60 * 60 * 1000;
};

const gh = async (...args) => {
	const child = Bun.spawn(['gh', ...args], { stdout: 'pipe', stderr: 'pipe' });
	const [out, err, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);

	if (code !== 0) throw new Error(`gh ${args.join(' ')} :: ${err.trim()}`);

	return out;
};

export const startIfDue = async ({ workflow, hours, until, repository = process.env.GITHUB_REPOSITORY }) => {
	const repo = repository ? ['--repo', repository] : [];
	const [last] = JSON.parse(
		await gh('run', 'list', ...repo, '--workflow', workflow, '--limit', '1', '--json', 'createdAt'),
	);

	if (!isDue({ lastStarted: last?.createdAt, hours, until })) {
		console.log(`${workflow}: not due${last ? `, last started ${last.createdAt}` : ''}`);

		return false;
	}

	await gh('workflow', 'run', workflow, ...repo, '--ref', 'main');
	console.log(`${workflow}: started${last ? `, as the last run started ${last.createdAt}` : ''}`);

	return true;
};

if (import.meta.main) {
	const [workflow, hours, flag, until] = process.argv.slice(2);

	if (
		!workflow ||
		!(Number(hours) > 0) ||
		(flag !== undefined && (flag !== '--until' || !/^\d{4}-\d\d-\d\d$/.test(until)))
	) {
		console.error('bun scripts/startIfDue.js <workflow file> <hours> [--until YYYY-MM-DD]');
		process.exit(2);
	}

	await startIfDue({ workflow, hours: Number(hours), until });
}
