import { REPOSITORY } from './search';

/** The issue form a mod's author explains a finding with, their repository filled in. */
export const explainUrl = entry =>
	`${REPOSITORY}/issues/new?${new URLSearchParams({ template: 'explain.yml', mod: `https://github.com/${entry.repo}` })}`;
