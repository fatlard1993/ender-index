const globals = require('globals');

module.exports = [
	...require('@vanilla-bean/components/eslint.app.config.cjs'),
	{
		files: ['src/**/*.js'],
		languageOptions: {
			globals: {
				...globals.node,
				Bun: true,
			},
		},
		rules: {
			'no-console': 'off',
			'compat/compat': 'off',
			// The resolver does not read package exports maps, which is how ender exposes its scanner.
			'import/no-unresolved': ['warn', { ignore: ['^ender-launcher/'] }],
		},
	},
	{
		files: ['worker/**/*.js'],
		rules: {
			// A Worker's console is its log, which wrangler tail reads
			'no-console': 'off',
		},
	},
	{
		files: ['client/**/*.js', 'scripts/**/*.js', 'test/**/*.js'],
		rules: {
			// The resolver does not read package exports maps, which is how ender exposes its ranking.
			'import/no-unresolved': ['warn', { ignore: ['^bun', '^ender-launcher/', '^@vanilla-bean/components/app$'] }],
		},
	},
];
