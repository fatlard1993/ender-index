import { REPOSITORY } from './search';

/** The issue form a shot is shared with, the mods it shows filled in. */
export const shareUrl = mods => {
	const params = new URLSearchParams({ template: 'shot.yml', mods: mods.join('\n') });

	return `${REPOSITORY}/issues/new?${params}`;
};
