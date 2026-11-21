import { join } from 'node:path';

import { DATA, parseLine, readJson, readRenames, recordPath, renamedLine, writeJson } from './crawl';
import { fieldsOf } from './shot';
import { modLineOf, modUrl } from './submit';

/** The authors' explanations, by mod and then by the finding each answers. */
export const EXPLANATIONS = 'explanations.json';

/** The issue form's fields, by the labels GitHub writes as headings into the issue it files. */
export const FIELDS = { mod: 'Mod', finding: 'Finding', explanation: 'Explanation' };

/** What a scan finds that an author can answer: each capability, and the hosts its strings name. */
export const FINDINGS = ['exec', 'classloading', 'native', 'network', 'unsafe', 'hosts'];

/** The most of an explanation kept: a few sentences, which a page shows whole beside the finding. */
export const EXPLANATION_KEPT = 1000;

/** The label that takes an explanation down, whoever wrote it. */
export const WITHDRAWN = 'withdrawn';

/**
 * Whether this GitHub account speaks for the repository: its owner, or a contributor who made at least half its
 * commits, as an author's own links in a readme are told apart.
 */
export const speaksFor = (login, record) => {
	const name = login?.toLowerCase();

	if (!name) return false;
	if (record.repo.split('/')[0].toLowerCase() === name) return true;

	const { commits = 0, people = [] } = record.contributors ?? {};
	const person = people.find(({ login: other }) => other.toLowerCase() === name);

	return person !== undefined && commits > 0 && person.commits * 2 >= commits;
};

/** The finding an answer names, as the form's options start with it. */
export const findingOf = answer => FINDINGS.find(finding => answer?.trim().toLowerCase().startsWith(finding));

/** Whether any jar recorded for the repository has this finding. */
const found = (record, finding) =>
	record.releases.some(({ assets }) =>
		assets.some(({ scan }) =>
			finding === 'hosts' ? Object.keys(scan?.hosts ?? {}).length > 0 : scan?.capabilities?.[finding] !== undefined,
		),
	);

/**
 * An issue explaining a finding, applied to the explanations kept: published when its author speaks for the
 * repository, changed when they edit it, and taken down when they empty it or the issue is labelled withdrawn. Answers
 * the explanations, what to tell the issue, and whether it is shown.
 */
export const explain = async (
	issue,
	{
		explanations,
		now = new Date().toISOString(),
		readRecord = name => readJson(recordPath({ host: 'github', name })),
		renames = {},
	},
) => {
	const fields = fieldsOf(issue.body);
	const line = modLineOf(fields[FIELDS.mod] ?? '');
	const kept = structuredClone(explanations);
	const answer = (say, shown = false) => ({ explanations: kept, say, shown });

	if (!line)
		return answer('The form names no repository: give its link on GitHub. Edit the issue and it is read again.');

	const { host, name } = parseLine(renamedLine(renames, line));

	if (host !== 'github') {
		return answer(
			'Only a mod on GitHub can be explained here for now: an issue tells the index which GitHub account it is from, and that says nothing of who keeps a repository on Codeberg or GitLab.',
		);
	}

	const record = await readRecord(name);

	if (!record) return answer(`${line} is not in the index, so it has no findings to explain.`);

	const finding = findingOf(fields[FIELDS.finding]);

	if (!finding) return answer(`Choose which finding this explains: ${FINDINGS.join(', ')}.`);

	const key = `github:${record.repo}`;
	const takeDown = () => {
		delete kept[key]?.[finding];
		if (kept[key] && Object.keys(kept[key]).length === 0) delete kept[key];
	};

	if (issue.labels?.some(label => (label.name ?? label) === WITHDRAWN)) {
		takeDown();

		return answer(`Taken down: the explanation of ${finding} no longer shows on ${record.repo}'s page.`);
	}

	if (!speaksFor(issue.user?.login, record)) {
		return answer(
			`Only ${record.repo}'s author can explain its findings: this issue has to come from the account that owns the repository, or one that made at least half its commits.`,
		);
	}

	const text = (fields[FIELDS.explanation] ?? '').replaceAll('\r\n', '\n').trim();

	if (!text) {
		takeDown();

		return answer(`With the explanation emptied, nothing shows beside ${finding} on ${record.repo}'s page.`);
	}

	if (text.length > EXPLANATION_KEPT) {
		return answer(
			`The explanation is ${text.length} characters, past the ${EXPLANATION_KEPT} shown. Edit the issue to shorten it and it is read again.`,
		);
	}

	const before = kept[key]?.[finding];

	(kept[key] ??= {})[finding] = {
		text,
		by: issue.user.login,
		at: before?.text === text ? before.at : now,
		release: before?.text === text ? before.release : record.releases[0]?.tag,
		issue: issue.html_url,
	};

	const page = modUrl({ host, repo: record.repo });
	const notYetFound = found(record, finding)
		? ''
		: `\n\nNone of its jars the index has read has this finding yet, so it shows once one does.`;

	return answer(
		`Shown beside ${finding} on ${page}, as your words. Edit this issue to change it, or empty the explanation to take it down.${notYetFound}`,
		true,
	);
};

/** The explanations kept, ordered so a change shows in the commit as only that change. */
export const writeExplanations = explanations =>
	writeJson(
		join(DATA, EXPLANATIONS),
		Object.fromEntries(Object.entries(explanations).sort(([a], [b]) => a.localeCompare(b))),
	);

/** Exits 3 when the issue changed nothing shown: it is told why. */
if (import.meta.main) {
	const issue = JSON.parse(process.env.EXPLAIN_EVENT);
	const { explanations, say, shown } = await explain(issue, {
		explanations: await readJson(join(DATA, EXPLANATIONS), {}),
		renames: await readRenames(),
	});

	await writeExplanations(explanations);
	await Bun.write(process.env.SUBMIT_SAY ?? Bun.stdout, `${say}\n`);
	process.exit(shown ? 0 : 3);
}
