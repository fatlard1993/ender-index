import { Content, View, theme } from '@vanilla-bean/components';

import { Prose } from './ModPage';
import { siteBar } from './ui';

/**
 * A page of the index's prose, linked by part as authors/funding: its markup, the title its tab takes, the name its bar
 * gives it, and the path of the whole guide, which a part's breadcrumb leads back to.
 */
export const guidePage = ({ markup, title, label, path }) =>
	class extends View {
		build() {
			const { part } = this.options;
			const prose = new Prose();

			prose.elem.innerHTML = markup();
			document.title = `${title} :: ender index`;

			this.content([
				siteBar(undefined, ...(part ? [{ label, href: path() }] : []), {
					label: part ? (prose.elem.querySelector(`#${CSS.escape(part)}`)?.textContent ?? part) : label,
				}),
				new Content({
					column: 900,
					style: { paddingBlock: theme.space.md },
					append: prose,
				}),
			]);

			if (part) requestAnimationFrame(() => prose.elem.querySelector(`#${CSS.escape(part)}`)?.scrollIntoView());
		}
	};
