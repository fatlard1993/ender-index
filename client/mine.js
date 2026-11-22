import { ownerOf } from 'ender-launcher/rank';

import { collectionKey } from './search';

/** What a mod lacks that the authors guide says how to give, by the guide's part for it. */
const NEEDS = {
	funding: entry => (entry.funding?.length ?? 0) === 0,
	releases: entry => Boolean(entry.fromSource),
};

/** The asks that go with each need, as the index counts them. */
const ASKS = { funding: 'fund', releases: 'release' };

/**
 * The mods a GitHub account keeps in the index, under its own name or an organization it belongs to, each with what it
 * lacks and how many players asked for that; those lacking most, and most asked after, first.
 */
export const yourMods = ({ entries, login, organizations = [], interest = {} }) => {
	const owners = new Set([login, ...organizations].map(owner => `github:${owner.toLowerCase()}`));

	return entries
		.filter(entry => owners.has(ownerOf(entry)))
		.map(entry => {
			const key = collectionKey(entry);
			const needs = Object.keys(NEEDS).filter(need => NEEDS[need](entry));

			return {
				entry,
				needs: needs.map(need => ({
					need,
					asked: interest[key]?.[ASKS[need]]?.length ?? 0,
				})),
			};
		})
		.sort(
			(a, b) =>
				b.needs.length - a.needs.length ||
				b.needs.reduce((sum, { asked }) => sum + asked, 0) - a.needs.reduce((sum, { asked }) => sum + asked, 0) ||
				a.entry.repo.localeCompare(b.entry.repo),
		);
};
