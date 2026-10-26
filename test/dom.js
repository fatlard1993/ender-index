import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * A browser's globals for one test file, taken away again after it. Preloaded for every file, as vbc's test setup is,
 * happy-dom's fetch, Request and Response would stand in for Bun's in the crawl's tests, which serve real requests.
 */
export const browser = ({ url = 'http://localhost/ender-index/', responses = {} } = {}) => {
	GlobalRegistrator.register({ url, width: 1280, height: 900 });

	globalThis.fetch = async request => {
		const address = String(request?.url ?? request);
		const found = Object.entries(responses).find(([ending]) => address.endsWith(ending));

		return found ? Response.json(found[1]) : new Response('', { status: 404 });
	};

	return () => GlobalRegistrator.unregister();
};
