import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { recordOf } from './shot.js';

const SHOWN = 'shown';

const client =
	(queue, token, fetcher) =>
	async (path, { method = 'GET', raw = false, missing = false } = {}) => {
		const response = await fetcher(`https://api.github.com/repos/${queue}${path}`, {
			method,
			headers: {
				accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
				authorization: `Bearer ${token}`,
				...(method === 'PATCH' ? { 'content-type': 'application/json' } : {}),
			},
			...(method === 'PATCH' ? { body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) } : {}),
		});

		if (missing && response.status === 404) return undefined;
		if (!response.ok) throw new Error(`GitHub answered ${method} ${path} with ${response.status}`);
		if (method === 'DELETE') return undefined;

		return raw ? new Uint8Array(await response.arrayBuffer()) : response.json();
	};

const issuesOf = async request => {
	const issues = [];

	for (let page = 1; ; page++) {
		const found = await request(`/issues?state=all&per_page=100&page=${page}`);

		issues.push(...found.filter(issue => !issue.pull_request));

		if (found.length < 100) return issues;
	}
};

/**
 * Publish the shots labelled shown into data: each image into data/shots, and data/shots.json listing them by the mods
 * they show, newest first. A published shot's issue is closed and its branch deleted; a turned-down shot's branch is
 * deleted too, so no image it held stays reachable. A label taken off unpublishes the shot.
 */
export const publishShots = async ({ queue, token, data, fetcher = fetch, log = console.log }) => {
	const request = client(queue, token, fetcher);
	const folder = join(data, 'shots');
	const shown = [];
	const kept = new Set();

	await mkdir(folder, { recursive: true });

	for (const issue of await issuesOf(request)) {
		const record = recordOf(issue.body);

		if (record?.id === undefined || record?.image === undefined) {
			log(`Shot issue #${issue.number} has no record that reads; it is left out`);
			continue;
		}

		const branch = `/git/refs/heads/shot/${record.id}`;
		const published = issue.labels.some(label => (label.name ?? label) === SHOWN);

		if (published) {
			const path = join(folder, record.image);

			if (!(await Bun.file(path).exists())) {
				const bytes = await request(`/contents/${record.image}?ref=shot/${record.id}`, { raw: true, missing: true });

				if (bytes === undefined) {
					log(`Shot issue #${issue.number} is labelled shown, but its picture's branch is gone`);
					continue;
				}

				await Bun.write(path, bytes);
				log(`Published the shot in #${issue.number}`);
			}

			kept.add(record.image);
			shown.push(record);
		}

		if (published || issue.state === 'closed') await request(branch, { method: 'DELETE', missing: true });
		if (published && issue.state === 'open') await request(`/issues/${issue.number}`, { method: 'PATCH' });
	}

	for (const file of await readdir(folder)) {
		if (!kept.has(file)) {
			await rm(join(folder, file));
			log(`Unpublished ${file}, whose issue is no longer labelled shown`);
		}
	}

	const byMod = {};

	for (const { id, image, story, name, mods, at } of shown.toSorted((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))) {
		for (const mod of mods ?? []) (byMod[mod] ??= []).push({ id, image: `shots/${image}`, story, name, at, mods });
	}

	await Bun.write(join(data, 'shots.json'), `${JSON.stringify(byMod, null, '\t')}\n`);

	return byMod;
};

if (import.meta.main) {
	const token = process.env.SHOTS_TOKEN;

	if (!token) {
		console.error('SHOTS_TOKEN is not set: the shots queue is private, and only a token that can write it reads it');
		process.exit(1);
	}

	const byMod = await publishShots({
		queue: process.env.SHOTS_QUEUE ?? 'fatlard1993/ender-shots',
		token,
		data: join(import.meta.dir, '..', 'data'),
	});

	console.log(`${Object.keys(byMod).length} mods have shots`);
}
