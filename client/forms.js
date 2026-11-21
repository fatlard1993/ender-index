import { REPOSITORY, repositoryUrl } from './search';

/** The issue form a mod's author explains a finding with, their repository filled in. */
export const explainUrl = entry =>
	`${REPOSITORY}/issues/new?${new URLSearchParams({ template: 'explain.yml', mod: `https://github.com/${entry.repo}` })}`;

/** The issue form that asks for a mod's jars to be read again by the newest scanner, its repository filled in. */
export const rescanUrl = entry =>
	`${REPOSITORY}/issues/new?${new URLSearchParams({ template: 'rescan.yml', mod: repositoryUrl(entry) })}`;
