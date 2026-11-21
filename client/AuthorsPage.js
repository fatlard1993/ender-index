import { guidePage } from './GuidePage';
import { guideMarkup } from './guide';
import { authorsPath } from './ui';

/** What a mod author's repository can hold for the index to make the most of. */
export default guidePage({ markup: guideMarkup, title: 'For mod authors', label: 'For authors', path: authorsPath });
