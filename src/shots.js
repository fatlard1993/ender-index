import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { shotOf } from './shot.js';

const SHOT = 'shot';

const SHOWN = 'shown';

/** A shot's picture as the index keeps it: WebP, at most 1920 on its longest side. */
export const shrink = async bytes => {
	const { default: sharp } = await import('sharp');

	return sharp(bytes).resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
};

const client = (repository, token, fetcher) => async (path, init) => {
	const response = await fetcher(`https://api.github.com/repos/${repository}${path}`, {
		...init,
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${token}`,
			...(init?.body ? { 'content-type': 'application/json' } : {}),
		},
	});

	if (!response.ok) throw new Error(`GitHub answered ${init?.method ?? 'GET'} ${path} with ${response.status}`);

	return response.json();
};

const issuesOf = async request => {
	const issues = [];

	for (let page = 1; ; page++) {
		const found = await request(`/issues?labels=${SHOT}&state=all&per_page=100&page=${page}`);

		issues.push(...found.filter(issue => !issue.pull_request));

		if (found.length < 100) return issues;
	}
};

const readJson = async path => {
	const file = Bun.file(path);

	return (await file.exists()) ? file.json() : {};
};

/**
 * Publish the shots labelled shown into data: each picture into data/shots, shrunk, and data/shots.json listing them by
 * the mods they show, newest first. A shot is read from its issue when it is first published and kept as it was then,
 * so its author editing the issue later changes nothing shown; taking the label off and putting it back reads it
 * again. The issue just labelled is told what in it did not read.
 */
export const publishShots = async ({
	repository,
	token,
	data,
	listing,
	labelled,
	fetcher = fetch,
	shrinkPicture = shrink,
	log = console.log,
}) => {
	const request = client(repository, token, fetcher);
	const folder = join(data, 'shots');
	const published = new Map(
		Object.values(await readJson(join(data, 'shots.json')))
			.flat()
			.map(shot => [shot.id, shot]),
	);
	const shown = [];

	await mkdir(folder, { recursive: true });

	for (const issue of await issuesOf(request)) {
		if (!issue.labels.some(label => (label.name ?? label) === SHOWN)) continue;

		const file = `${issue.number}.webp`;
		const kept = published.get(issue.number);

		if (kept && (await Bun.file(join(folder, file)).exists())) {
			shown.push(kept);
			continue;
		}

		const { shot, picture, problems } = shotOf(issue, listing);
		const tell = async lines => {
			log(`Shot #${issue.number}: ${lines.join('; ')}`);

			if (issue.number === labelled) {
				await request(`/issues/${issue.number}/comments`, {
					method: 'POST',
					body: JSON.stringify({ body: lines.map(line => `- ${line}`).join('\n') }),
				});
			}
		};

		if (shot.mods.length === 0 || !picture || !shot.story) {
			await tell([...problems, 'so it is not shown: fix the issue, then take the label off and put it back']);
			continue;
		}

		const response = await fetcher(picture);

		if (!response.ok) {
			await tell([`Its picture did not download: GitHub answered ${response.status}`]);
			continue;
		}

		try {
			await Bun.write(join(folder, file), await shrinkPicture(new Uint8Array(await response.arrayBuffer())));
		} catch (error) {
			await tell([`Its picture could not be read as one: ${error.message}`]);
			continue;
		}

		if (problems.length > 0) await tell([...problems, 'so it is shown on the rest']);

		shown.push({ ...shot, image: `shots/${file}` });
		log(`Published shot #${issue.number}`);

		if (issue.state === 'open') {
			await request(`/issues/${issue.number}`, {
				method: 'PATCH',
				body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
			});
		}
	}

	const files = new Set(shown.map(shot => shot.image.replace('shots/', '')));

	for (const file of await readdir(folder)) {
		if (!files.has(file)) {
			await rm(join(folder, file));
			log(`Unpublished ${file}: its issue is no longer labelled ${SHOWN}`);
		}
	}

	const byMod = {};

	for (const shot of shown.toSorted((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))) {
		for (const mod of shot.mods) (byMod[mod] ??= []).push(shot);
	}

	await Bun.write(join(data, 'shots.json'), `${JSON.stringify(byMod, null, '\t')}\n`);

	return byMod;
};

if (import.meta.main) {
	const data = join(import.meta.dir, '..', 'data');
	const byMod = await publishShots({
		repository: process.env.GITHUB_REPOSITORY ?? 'fatlard1993/ender-index',
		token: process.env.GITHUB_TOKEN,
		data,
		listing: await Bun.file(join(data, 'search.json')).json(),
		labelled: Number(process.env.SHOT_ISSUE) || undefined,
	});

	console.log(`${Object.keys(byMod).length} mods have shots`);
}
