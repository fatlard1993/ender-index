/** What mod templates ship as a description, which says nothing about the mod built from them. */
const TEMPLATES = [
	/^this is an example description/i,
	/^a short description of your mod/i,
	/^an? example mod\.?$/i,
	/^example mod description/i,
	/^based utility mod\.?$/i,
	/^the mod description/i,
	/^\$\{[^}]+\}$/,
	/^(todo|description|mod description)\.?$/i,
];

export const LENGTH = 200;

/** A description worth showing: long enough to say something, and not what a template says. */
export const informative = text =>
	typeof text === 'string' && text.trim().length >= 8 && !TEMPLATES.some(template => template.test(text.trim()));

/** Text on one line, cut at a sentence when one ends near the limit, or else at a word. */
export const shorten = text => {
	const flat = text.replace(/\s+/g, ' ').trim();

	if (flat.length <= LENGTH) return flat;

	const cut = flat.slice(0, LENGTH);
	const sentence = cut.lastIndexOf('. ');

	return sentence > LENGTH / 3 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}...`;
};

const plain = paragraph =>
	paragraph
		.replaceAll(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replaceAll(/<[^>]+>/g, '')
		.replaceAll(/[*_`~]+/g, '')
		.replace(/\s+/g, ' ')
		.trim();

/** A paragraph that is a heading, a list, a table, a quote or a row of badges, rather than prose. */
const notProse = paragraph => /^\s*(#|\||>|[-*+]\s|\d+\.\s|!\[|\[!\[|<img|<p align)/i.test(paragraph);

/**
 * The first paragraph of a readme that reads as prose about the mod, as plain text: headings, badges, images, lists,
 * tables and code are passed over, and so is a line that only leads into a list; links keep their words.
 */
export const readmeSummary = markdown => {
	const prose = markdown
		.replaceAll(/<!--[\s\S]*?-->/g, '')
		.replaceAll(/```[\s\S]*?```/g, '')
		.split(/\n\s*\n/)
		.filter(paragraph => !notProse(paragraph))
		.map(plain)
		.find(text => text.length >= 30 && text.includes(' ') && /[a-z]{3}/i.test(text) && !text.endsWith(':'));

	return prose ? shorten(prose) : null;
};
