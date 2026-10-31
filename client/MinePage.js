import { Card, Content, EmptyState, Link, View, theme } from '@vanilla-bean/components';

import { loadInterest, loadListing } from './data';
import { local } from './local';
import { yourMods } from './mine';
import { modPath, pictureUrl, titleOf } from './search';
import { Meta, Row, Stack, Title, Warning, authorsPath, avatar, count, date, siteBar } from './ui';

/** What each lack costs a mod, said to its author, with the part of the guide that says how to mend it. */
const LACKS = {
	funding:
		'Players have no way to pay you for it: no FUNDING.yml here or on your account, no support link in its metadata, and no donation link on its Modrinth project or your others there.',
	releases: 'It has no release with a jar, so players have ender build it from source, which takes them minutes.',
};

const ASKED = { funding: 'would pay you', releases: 'asked for a built release' };

const needLine = ({ need, asked, told, closed }) =>
	new Warning({
		append: [
			`${LACKS[need]} `,
			...(asked > 0 ? [`${count(asked)} ${asked === 1 ? 'player' : 'players'} ${ASKED[need]}. `] : []),
			...(told ? [`The index told you on ${told}. `] : []),
			...(closed ? [`You closed its note on ${closed}, so it passes on no more asks. `] : []),
			new Link({ href: authorsPath(need), textContent: 'How to fix that' }),
		],
	});

const modCard = ({ entry, needs }) =>
	new Card(
		{},
		new Row({
			style: { flexWrap: 'nowrap', alignItems: 'flex-start', gap: theme.space.md },
			append: [
				avatar(pictureUrl(entry, 96), 48),
				new Stack({
					style: { flex: '1', minWidth: '0', gap: theme.space.sm },
					append: [
						new Row({
							append: [
								new Link({ href: `#${modPath(entry)}`, append: new Title({ textContent: titleOf(entry) }) }),
								new Meta({
									textContent: [
										entry.repo,
										`${count(entry.stars ?? 0)} stars`,
										entry.downloads === undefined ? '' : `${count(entry.downloads)} downloads`,
										entry.latest?.published ? `released ${date(entry.latest.published)}` : '',
									]
										.filter(Boolean)
										.join(' · '),
								}),
							],
						}),
						...(needs.length > 0
							? needs.map(needLine)
							: [new Meta({ textContent: 'Releases with jars, and a way for players to pay you: nothing to do.' })]),
					],
				}),
			],
		}),
	);

/**
 * The mods of the GitHub account ender signs in as, each with what the index cannot do for it and how many players
 * asked: only ender, signed in, knows whose page this is.
 */
export default class MinePage extends View {
	build() {
		const body = new Stack({ append: new EmptyState({ loading: true, title: 'Asking ender who you are on GitHub' }) });

		document.title = 'Your mods :: ender index';
		this.content([
			siteBar(undefined, { label: 'Your mods' }),
			new Content({ column: 900, style: { paddingBlock: '12px' }, append: body }),
		]);

		this.show(body).catch(error =>
			body.content(
				new EmptyState({ icon: 'triangle-exclamation', title: 'Your mods did not load', message: error.message }),
			),
		);
	}

	async show(body) {
		if (!(await local.ready())) {
			body.content(
				new EmptyState({
					icon: 'user',
					title: 'Only ender knows whose mods these are',
					message: 'Run ender web, signed in to GitHub, and open this page from it: it lists the mods of that account.',
				}),
			);

			return;
		}

		await local.loadAccount();

		if (!local.login) {
			body.content(
				new EmptyState({
					icon: 'user',
					title: 'ender is not signed in to GitHub',
					message:
						local.accountError ??
						'This ender is too old to say who it signs in as: ender upgrade brings it up to date.',
				}),
			);

			return;
		}

		const [entries, { interest, notices }] = await Promise.all([loadListing(), loadInterest()]);
		const mods = yourMods({ entries, login: local.login, interest, notices });
		const lacking = mods.filter(({ needs }) => needs.length > 0).length;

		if (this.signal.aborted) return;

		body.content([
			new Title({ tag: 'h1', textContent: 'Your mods' }),
			new Meta({
				tag: 'p',
				textContent:
					mods.length > 0
						? `Signed in to GitHub as ${local.login}: ${count(mods.length)} of your repositories are in the index, ${lacking > 0 ? `${count(lacking)} of them with something the index cannot do for players` : 'and each has what players need'}.`
						: `Signed in to GitHub as ${local.login}, whose repositories have no mods in the index yet. Mods kept under an organization are listed under it.`,
			}),
			new Link({ href: authorsPath(), textContent: 'What the index reads from your repositories' }),
			...mods.map(modCard),
		]);
	}
}
