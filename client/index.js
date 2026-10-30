import { Page, Router, View } from '@vanilla-bean/components';

import AuthorsPage from './AuthorsPage';
import CollectionBar from './CollectionBar';
import GetPage from './GetPage';
import InstancesPage from './InstancesPage';
import MinePage from './MinePage';
import ModPage from './ModPage';
import PackPage from './PackPage';
import PacksPage from './PacksPage';
import SearchPage from './SearchPage';

import '@vanilla-bean/components/app/reloadOnBuild';

new Page({
	appendTo: document.body,
	append: new View({
		append: [
			new Router({
				views: {
					'/': SearchPage,
					'/packs': PacksPage,
					'/pack/:host/:owner/:name': PackPage,
					'/get': GetPage,
					'/authors': AuthorsPage,
					'/authors/:part': AuthorsPage,
					'/instances': InstancesPage,
					'/mine': MinePage,
					'/mod/:host/:owner/:name': ModPage,
				},
				onRenderView: () => (document.title = 'ender index'),
			}),
			new CollectionBar(),
		],
	}),
});
