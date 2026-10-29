import { Content, View } from '@vanilla-bean/components';

import { guideMarkup } from './guide';
import { Prose } from './ModPage';
import { Title, authorsPath, siteBar } from './ui';

/** What a mod author's repository can hold for the index to make the most of: linked by part, as #/authors/funding. */
export default class AuthorsPage extends View {
	build() {
		const { part } = this.options;
		const prose = new Prose();

		prose.elem.innerHTML = guideMarkup();
		document.title = 'For mod authors :: ender index';

		this.content([
			siteBar(undefined, ...(part ? [{ label: 'For authors', href: authorsPath() }] : []), {
				label: part ? (prose.elem.querySelector(`#${CSS.escape(part)}`)?.textContent ?? part) : 'For authors',
			}),
			new Content({
				column: 900,
				style: { paddingBlock: '12px' },
				append: [new Title({ tag: 'h1', textContent: 'For mod authors' }), prose],
			}),
		]);

		if (part) requestAnimationFrame(() => prose.elem.querySelector(`#${CSS.escape(part)}`)?.scrollIntoView());
	}
}
