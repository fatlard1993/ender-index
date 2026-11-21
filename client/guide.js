import { marked } from 'marked';

import guide from './authors.md' with { type: 'text' };
import { slug } from './search';

/**
 * The guide as markup: each section's heading takes the id its part of the route names, a link to one of them stays
 * on the page, and every other link leaves in a new tab.
 */
export const renderGuide = markdown => {
	const renderer = new marked.Renderer();

	renderer.heading = function ({ tokens, depth }) {
		const text = this.parser.parseInline(tokens);

		return `<h${depth} id="${slug(text.replace(/<[^>]+>/g, ''))}">${text}</h${depth}>`;
	};

	renderer.link = function ({ href, tokens }) {
		const text = this.parser.parseInline(tokens);

		return href.startsWith('#')
			? `<a href="${href}">${text}</a>`
			: `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
	};

	return marked.parse(markdown, { renderer });
};

export const guideMarkup = () => renderGuide(guide);
