import { expect, test } from 'bun:test';

import { INDEX_ISSUES, issueBody } from 'ender-launcher/indexIssues';

import { answerOf } from '../src/submit';

const FORMS = { fund: 'fund.yml', release: 'release.yml', pack: 'pack.yml' };
const WORKFLOWS = { fund: 'interest.yml', release: 'interest.yml', pack: 'packs.yml' };

/** The title as a workflow's expression writes it, a quote doubled. */
const quoted = title => `'${title.replaceAll("'", "''")}'`;

test.each(Object.keys(INDEX_ISSUES))(
	"an issue ender files as %s has its form's title, and a workflow that knows it by that title",
	async kind => {
		const form = await Bun.file(`.github/ISSUE_TEMPLATE/${FORMS[kind]}`).text();
		const workflow = await Bun.file(`.github/workflows/${WORKFLOWS[kind]}`).text();
		const { title, labels, heading } = INDEX_ISSUES[kind];

		expect(form).toContain(`title: ${quoted(title)}`);
		expect(form).toContain(`labels: [${labels.join(', ')}]`);
		expect(form).toContain(`label: ${heading}`);
		expect(workflow).toContain(`github.event.issue.title == ${quoted(title)}`);
		expect(answerOf(issueBody(kind, 'github:a/b'), heading)).toBe('github:a/b');
	},
);
