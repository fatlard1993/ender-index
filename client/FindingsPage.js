import { guidePage } from './GuidePage';
import { findingsMarkup } from './guide';
import { findingsPath } from './ui';

/** What each finding of a scan means: for a player deciding about a mod, and for its author answering one. */
export default guidePage({
	markup: findingsMarkup,
	title: 'What findings mean',
	label: 'Findings',
	path: findingsPath,
});
