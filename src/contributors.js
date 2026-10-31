import { linksOf, parseFunding, readmeSupport, supportLinks } from './funding';
import * as github from './github';
import { RateLimited } from './fetch';

/** Contributors kept by name, the most commits first; the rest are counted. */
export const CONTRIBUTORS_KEPT = 12;

const WEEK = 7 * 24 * 60 * 60 * 1000;

const isBot = ({ login, type }) => type === 'Bot' || login.endsWith('[bot]');

/**
 * A repository's contributors as GitHub lists them, the most commits first: bots left out, the first CONTRIBUTORS_KEPT
 * by name, and the commits of all of them, which each one's share is of.
 */
export const rankContributors = listed => {
	const people = listed.filter(person => !isBot(person));

	return {
		commits: people.reduce((sum, { contributions }) => sum + contributions, 0),
		more: Math.max(people.length - CONTRIBUTORS_KEPT, 0),
		people: people.slice(0, CONTRIBUTORS_KEPT).map(({ login, contributions }) => ({ login, commits: contributions })),
	};
};

/** One GraphQL query for how each of these GitHub accounts takes support, each aliased by its place. */
export const peopleQuery = logins =>
	`query { ${logins
		.map(
			(login, at) =>
				`u${at}: user(login: ${JSON.stringify(login)}) { name hasSponsorsListing websiteUrl account: repository(name: ".github") { root: object(expression: "HEAD:FUNDING.yml") { ... on Blob { text } } nested: object(expression: "HEAD:.github/FUNDING.yml") { ... on Blob { text } } } }`,
		)
		.join(' ')} }`;

/**
 * How an account takes support: its own FUNDING.yml, its GitHub Sponsors listing, and its profile's website when that
 * is a site known for support. An account GitHub does not know takes none.
 */
export const personFunding = (login, user) => {
	if (!user) return [];

	const links = parseFunding(user.account?.root?.text ?? user.account?.nested?.text ?? '');
	const sponsors = `https://github.com/sponsors/${login}`;

	if (user.hasSponsorsListing && !links.some(({ url }) => url === sponsors))
		links.push({ platform: 'github', url: sponsors });
	if (/^https?:\/\//i.test(user.websiteUrl ?? ''))
		for (const link of supportLinks([{ name: 'website', url: user.websiteUrl }]))
			if (!links.some(({ url }) => url === link.url)) links.push(link);

	return links;
};

/**
 * Who made a GitHub repository, from its contributors, each with the name their profile gives and how they take
 * support: their account's, and the repository's readme's links to their own pages. Read again weekly; a person's
 * account is asked once a crawl, in `people`, and an answer that fails keeps what was known.
 */
export const contributorsOf = async ({
	name,
	recorded,
	now,
	people,
	list = repo => github.contributors(repo, rankContributors),
	ask = github.graphql,
	readme = async () => '',
}) => {
	const known = { contributors: recorded?.contributors, contributorsChecked: recorded?.contributorsChecked };

	if (known.contributorsChecked && Date.parse(now) - Date.parse(known.contributorsChecked) < WEEK) return known;

	let ranked;

	try {
		ranked = await list(name);
	} catch (error) {
		if (error instanceof RateLimited) throw error;

		console.error(`contributors ${name} :: ${error.message}`);

		return known;
	}

	const asking = ranked.people.map(({ login }) => login).filter(login => !people.has(login));

	if (asking.length > 0) {
		const answer = ask(peopleQuery(asking));

		asking.forEach((login, at) =>
			people.set(
				login,
				answer.then(data => ({
					name: data[`u${at}`]?.name || undefined,
					funding: personFunding(login, data[`u${at}`]),
				})),
			),
		);
	}

	const inReadme = ranked.people.length > 0 ? readmeSupport(await readme()) : [];

	try {
		return {
			contributors: {
				...ranked,
				people: await Promise.all(
					ranked.people.map(async person => {
						const { name: shown, funding: own } = await people.get(person.login);

						return {
							...person,
							...(shown && shown !== person.login ? { name: shown } : {}),
							funding: [
								...own,
								...linksOf(inReadme, person.login).filter(link => !own.some(({ url }) => url === link.url)),
							],
						};
					}),
				),
			},
			contributorsChecked: now,
		};
	} catch (error) {
		for (const login of asking) people.delete(login);

		console.error(`contributors ${name} :: their funding was not read: ${error.message}`);

		return known;
	}
};
