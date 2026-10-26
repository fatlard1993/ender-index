import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { LIBRARY_STYLESHEETS, buildClient } from '@vanilla-bean/components/app';

const OUT = join(import.meta.dir, '..', 'client', 'build');

/**
 * The stylesheets the library's Page links, with the fonts they name, copied beside the page. Pages
 * serves files and nothing else, so what an app server would answer from node_modules is in the build.
 */
export const copyLibraryStylesheets = async (out = OUT) => {
	for (const stylesheet of LIBRARY_STYLESHEETS) {
		const source = Bun.resolveSync(stylesheet, import.meta.dir);
		const css = await Bun.file(source).text();
		const fonts = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(([, url]) => url);

		for (const file of new Set(['', ...fonts].map(url => (url ? join(dirname(stylesheet), url) : stylesheet)))) {
			const from = join(dirname(source), relative(dirname(stylesheet), file));

			await mkdir(dirname(join(out, file)), { recursive: true });
			await Bun.write(join(out, file), Bun.file(from));
		}
	}
};

/**
 * Files the library's styles reach by a path from the page rather than through a stylesheet: the code font is declared
 * in a style the library writes at runtime.
 */
export const LIBRARY_FILES = ['@vanilla-bean/components/FontWithASyntaxHighlighter-Regular.woff2'];

export const copyLibraryFiles = async (out = OUT) => {
	const library = dirname(Bun.resolveSync('@vanilla-bean/components/package.json', import.meta.dir));

	for (const file of LIBRARY_FILES) {
		await mkdir(dirname(join(out, file)), { recursive: true });
		await Bun.write(join(out, file), Bun.file(join(library, relative('@vanilla-bean/components', file))));
	}
};

if (import.meta.main) {
	const { success, logs } = await buildClient({ publicPath: '' });

	if (!success) {
		for (const log of logs) console.error(log);

		process.exit(1);
	}

	await copyLibraryStylesheets();
	await copyLibraryFiles();

	console.log(`Built the search page into ${OUT}`);
}
