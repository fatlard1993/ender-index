import { Page, Router, View } from '@vanilla-bean/components';

import CollectionBar from './CollectionBar';
import GetPage from './GetPage';
import InstancesPage from './InstancesPage';
import ModPage from './ModPage';
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
					'/get': GetPage,
					'/instances': InstancesPage,
					'/mod/:host/:owner/:name': ModPage,
				},
				onRenderView: () => (document.title = 'ender index'),
			}),
			new CollectionBar(),
		],
	}),
});
