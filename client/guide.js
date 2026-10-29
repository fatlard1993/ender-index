import { marked } from 'marked';

import guide from './authors.md' with { type: 'text' };
import { slug } from './search';

/** The guide as markup: each section's heading takes the id its part of the route names, and links leave in a new tab. */
export const renderGuide = markdown => {
	const renderer = new marked.Renderer();

	renderer.heading = function ({ tokens, depth }) {
		const text = this.parser.parseInline(tokens);

		return `<h${depth} id="${slug(text.replace(/<[^>]+>/g, ''))}">${text}</h${depth}>`;
	};

	renderer.link = function ({ href, tokens }) {
		return `<a href="${href}" target="_blank" rel="noopener noreferrer">${this.parser.parseInline(tokens)}</a>`;
	};

	return marked.parse(markdown, { renderer });
};

export const guideMarkup = () => renderGuide(guide);
