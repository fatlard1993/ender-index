import { Page } from '@vanilla-bean/components';

import SearchPage from './SearchPage';

new Page({ appendTo: document.body, append: new SearchPage() });
