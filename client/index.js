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
import SettingsPage from './SettingsPage';
import { ROUTES, addressOf, followLinks, hashRoute, navigate, routeOf } from './route';

import '@vanilla-bean/components/app/reloadOnBuild';

/** The router of a site served under a base: its path is the page's below the base. */
class SiteRouter extends Router {
	get path() {
		return routeOf(location);
	}

	set path(route) {
		navigate(route);
	}
}

const shared = hashRoute(location.hash);

if (shared) history.replaceState(null, '', addressOf(shared));

followLinks();

new Page({
	appendTo: document.body,
	append: new View({
		append: [
			new SiteRouter({
				mode: 'history',
				views: {
					[ROUTES.mods]: SearchPage,
					[ROUTES.packs]: PacksPage,
					[ROUTES.pack]: PackPage,
					[ROUTES.get]: GetPage,
					[ROUTES.authors]: AuthorsPage,
					[ROUTES.authorsPart]: AuthorsPage,
					[ROUTES.instances]: InstancesPage,
					[ROUTES.settings]: SettingsPage,
					[ROUTES.mine]: MinePage,
					[ROUTES.mod]: ModPage,
				},
				onRenderView: () => (document.title = 'ender index'),
			}),
			new CollectionBar(),
		],
	}),
});
