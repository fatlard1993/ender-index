import { join } from 'node:path';

/**
 * The repositories the index withholds at someone's request other than their author's, as a takedown: by their
 * repos.txt line, each with the reason. Kept by hand; an author opts out with a topic instead.
 */
export const WITHHELD = 'withheld.json';

/** The withheld lines, in lower case as hosts compare names, each with its reason. */
export const readWithheld = async data => {
	const file = Bun.file(join(data, WITHHELD));
	const listed = (await file.exists()) ? await file.json() : {};

	return new Map(Object.entries(listed).map(([line, reason]) => [line.toLowerCase(), reason]));
};

/** The reason a repository is withheld, by its repos.txt line, or undefined when it is not. */
export const withheldReason = (withheld, line) => withheld.get(line.toLowerCase());
