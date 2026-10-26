import { Page, Router } from '@vanilla-bean/components';

import CollectionBar from './CollectionBar';
import ModPage from './ModPage';
import SearchPage from './SearchPage';
import { View } from './ui';

new Page({
	appendTo: document.body,
	append: new View({
		append: [
			new Router({
				views: { '/': SearchPage, '/mod/:host/:owner/:name': ModPage },
				onRenderView: () => (document.title = 'ender index'),
			}),
			new CollectionBar(),
		],
	}),
});
