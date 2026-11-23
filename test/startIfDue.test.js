import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { isDue } from '../scripts/startIfDue';

const at = text => Date.parse(text);

describe('a daily workflow the crawl starts', () => {
	test('is due when it never ran or last started that many hours ago, and never after the last day it is wanted', () => {
		const now = at('2026-11-23T12:00:00Z');

		expect(isDue({ lastStarted: undefined, hours: 23, now })).toBe(true);
		expect(isDue({ lastStarted: '2026-11-22T13:00:00Z', hours: 23, now })).toBe(true);
		expect(isDue({ lastStarted: '2026-11-22T13:00:01Z', hours: 23, now })).toBe(false);
		expect(isDue({ lastStarted: '2026-11-22T13:00:00Z', hours: 23, until: '2026-12-22', now })).toBe(true);
		expect(isDue({ lastStarted: undefined, hours: 23, until: '2026-11-23', now })).toBe(true);
		expect(isDue({ lastStarted: undefined, hours: 23, until: '2026-11-22', now })).toBe(false);
	});

	test('is started through gh only when due, after asking gh when it last started', async () => {
		const bin = await mkdtemp(join(tmpdir(), 'ender-gh-'));
		const asked = join(bin, 'asked');

		try {
			const run = async lastStarted => {
				// A gh that says when the workflow last started, and writes down what it was asked
				await Bun.write(
					join(bin, 'gh'),
					`#!/bin/sh\necho "$*" >> "${asked}"\n[ "$1" = run ] && echo '${lastStarted ? `[{"createdAt":"${lastStarted}"}]` : '[]'}'\nexit 0\n`,
				);
				await chmod(join(bin, 'gh'), 0o755);
				await rm(asked, { force: true });

				const child = Bun.spawn(
					['bun', join(import.meta.dir, '..', 'scripts', 'startIfDue.js'), 'data-squash.yml', '23'],
					{
						env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: 'me/index' },
						stdout: 'pipe',
					},
				);
				const said = await child.stdout.text();

				await child.exited;

				return { said: said.trim(), asked: (await Bun.file(asked).text()).trim().split('\n') };
			};
			const listed = 'run list --repo me/index --workflow data-squash.yml --limit 1 --json createdAt';
			const started = 'workflow run data-squash.yml --repo me/index --ref main';

			expect(await run(undefined)).toEqual({ said: 'data-squash.yml: started', asked: [listed, started] });
			expect(await run(new Date(Date.now() - 25 * 3_600_000).toISOString())).toMatchObject({
				asked: [listed, started],
			});

			const recent = new Date(Date.now() - 2 * 3_600_000).toISOString();

			expect(await run(recent)).toEqual({ said: `data-squash.yml: not due, last started ${recent}`, asked: [listed] });
		} finally {
			await rm(bin, { recursive: true, force: true });
		}
	});
});
