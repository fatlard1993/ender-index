import {
	Button,
	Card,
	Component,
	Content,
	EmptyState,
	Link,
	SectionLabel,
	Toolbar,
	View,
	styled,
	theme,
} from '@vanilla-bean/components';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { HOSTS, sharing } from 'ender-launcher/rank';

import { collection } from './collection';
import { loadListing } from './data';
import {
	CAPABILITIES,
	REPOSITORY,
	fileSize,
	installCommand,
	loadersOf,
	pictureUrl,
	readmeSources,
	readmeUrl,
	recordUrl,
	releaseUrl,
	repositoryUrl,
	titleOf,
} from './search';
import { collectButton, installControls } from './controls';
import { local } from './local';
import { Chip, Command, Meta, Row, Stack, Warning, avatar, copyCommand, count, date, loadJson, paragraph } from './ui';

const Heading = styled.Component(
	() => `
		margin: 0;
		font-size: 1.6em;
		overflow-wrap: anywhere;
	`,
);

const Stat = styled.Component(
	({ colors, radius, space }) => `
		display: flex;
		flex-direction: column;
		padding: ${space.sm} ${space.md};
		border: 1px solid ${colors.border};
		border-radius: ${radius.md};
		min-width: 7em;

		& > strong {
			font-size: 1.2em;
		}
	`,
);

/** A readme as its host would show it, kept to this column: wide images and tables scale or scroll, never the page. */
const Prose = styled.Component(
	({ colors, radius, space }) => `
		line-height: 1.55;
		overflow-wrap: anywhere;

		& img, & video {
			max-width: 100%;
			height: auto;
		}

		& h1, & h2, & h3 {
			border-bottom: 1px solid ${colors.border};
			padding-bottom: ${space.xs};
		}

		& pre {
			background: ${colors.overlay};
			border-radius: ${radius.sm};
			padding: ${space.md};
			overflow-x: auto;
		}

		& code {
			background: ${colors.overlay};
			border-radius: ${radius.sm};
			padding: 0 ${space.xs};
		}

		& pre code {
			padding: 0;
			background: none;
		}

		& table {
			display: block;
			overflow-x: auto;
			border-collapse: collapse;
		}

		& th, & td {
			border: 1px solid ${colors.border};
			padding: ${space.xs} ${space.sm};
		}

		& blockquote {
			margin: 0;
			padding-left: ${space.md};
			border-left: 3px solid ${colors.border};
			color: ${colors.muted};
		}

		& a {
			color: ${colors.accent};
		}
	`,
);

const stat = (value, label) => new Stat({ append: [new Component({ tag: 'strong', textContent: value }), label] });

const slug = text =>
	text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');

const HEADING_PREFIX = 'readme-';

/**
 * A readme as safe markup: it is anyone's HTML, so it is sanitized before it is shown, links leave in a new tab, and
 * every relative image and link is pointed back at its repository.
 */
const renderReadme = (markdown, sources) => {
	const renderer = new marked.Renderer();

	renderer.heading = function ({ tokens, depth }) {
		const text = this.parser.parseInline(tokens);

		return `<h${depth} id="${HEADING_PREFIX}${slug(text.replace(/<[^>]+>/g, ''))}">${text}</h${depth}>`;
	};

	const purify = DOMPurify();

	purify.addHook('afterSanitizeAttributes', node => {
		if (node.hasAttribute('src')) node.setAttribute('src', readmeUrl(node.getAttribute('src'), sources.raw));

		if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy');

		if (node.tagName === 'A' && node.hasAttribute('href')) {
			const href = node.getAttribute('href');

			if (href.startsWith('#')) node.setAttribute('href', `#${HEADING_PREFIX}${href.slice(1)}`);
			else {
				node.setAttribute('href', readmeUrl(href, sources.page));
				node.setAttribute('target', '_blank');
				node.setAttribute('rel', 'noopener noreferrer');
			}
		}
	});

	return purify.sanitize(marked.parse(markdown, { renderer, gfm: true }), { ADD_ATTR: ['target'] });
};

const fetchReadme = async (entry, signal) => {
	const sources = readmeSources(entry);

	for (const candidate of sources.candidates) {
		const response = await fetch(candidate, { signal }).catch(error => {
			if (error.name === 'AbortError') throw error;
		});

		if (response?.ok) return { markdown: await response.text(), sources };
	}

	return undefined;
};

const capabilityList = scan =>
	Object.entries(scan?.capabilities ?? {}).map(([capability, classes]) => {
		const details = new Component({ tag: 'details' });

		details.append(
			new Component({
				tag: 'summary',
				append: [
					new Chip({ addClass: 'finding', textContent: `reaches ${capability}` }),
					` ${CAPABILITIES[capability] ?? ''}`,
				],
			}),
			...Object.entries(classes).map(
				([className, calls]) =>
					new Meta({ tag: 'div', style: { marginLeft: '1em' }, textContent: `${className}: ${calls.join(', ')}` }),
			),
		);

		return details;
	});

const releaseCard = (entry, release) =>
	new Card(
		{},
		new Stack({
			style: { gap: theme.space.sm },
			append: [
				new Row({
					append: [
						new Link({
							href: releaseUrl({ ...entry, latest: release }),
							target: '_blank',
							append: new Component({ tag: 'strong', textContent: release.tag }),
						}),
						new Meta({ textContent: date(release.published) }),
						...(release.prerelease ? [new Chip({ textContent: 'prerelease' })] : []),
					],
				}),
				...release.assets.map(asset => {
					const mods = asset.mods ?? [];

					return new Stack({
						style: { gap: theme.space.xs, paddingLeft: theme.space.md },
						append: [
							new Row({
								append: [
									new Link({ href: asset.url, textContent: asset.name }),
									new Meta({
										textContent: [
											fileSize(asset.size),
											asset.downloads === undefined ? '' : `${count(asset.downloads)} downloads`,
										]
											.filter(Boolean)
											.join(' · '),
									}),
									...(asset.gone ? [new Warning({ textContent: `gone since ${date(asset.gone)}` })] : []),
									...(asset.replaced ? [new Warning({ textContent: 'changed after publishing' })] : []),
								],
							}),
							...mods.map(
								mod =>
									new Meta({
										tag: 'div',
										textContent: [
											`${mod.name ?? mod.id} ${mod.version ?? ''}`,
											mod.loader,
											mod.minecraft && `Minecraft ${mod.minecraft}`,
											mod.environment && mod.environment !== '*' && `${mod.environment} only`,
											mod.depends?.length && `needs ${mod.depends.join(', ')}`,
										]
											.filter(Boolean)
											.join(' · '),
									}),
							),
							...capabilityList(asset.scan),
							...(Object.keys(asset.scan?.hosts ?? {}).length > 0
								? [new Meta({ tag: 'div', textContent: `Names hosts: ${Object.keys(asset.scan.hosts).join(', ')}` })]
								: []),
						],
					});
				}),
			],
		}),
	);

export default class ModPage extends View {
	static schema = { host: {}, owner: {}, name: {} };

	build() {
		const repo = `${this.options.owner}/${this.options.name}`;
		const host = this.options.host;
		const back = new Link({ variant: 'flat', href: `${location.search}#/`, textContent: 'Back to search' });
		const body = new Stack({ append: new EmptyState({ loading: true, title: `Loading ${repo}` }) });

		this.content([
			new Toolbar({
				variant: 'bar',
				heading: 'ender index',
				append: [back, new Link({ variant: 'flat', href: REPOSITORY, target: '_blank', textContent: 'Source' })],
			}),
			new Content({ column: 900, style: { paddingBlock: '12px' }, append: body }),
		]);

		const { signal } = this;

		loadListing()
			.then(async listing => {
				const entry = listing.find(found => found.repo === repo && (found.host ?? 'github') === host);

				if (entry === undefined) {
					body.content(
						new EmptyState({
							icon: 'magnifying-glass',
							title: `${repo} is not in the index`,
							message: 'It may have been archived, or it has no release with a mod jar the crawl could read',
						}),
					);

					return;
				}

				const record = await loadJson(recordUrl(entry), signal);

				if (signal.aborted) return;

				this.show(entry, record, listing);
			})
			.catch(error => {
				if (signal.aborted) return;

				body.content(
					new EmptyState({
						icon: 'triangle-exclamation',
						title: 'The index did not load',
						message: error.message,
						action: { textContent: 'Try again', onPointerPress: () => this.render() },
					}),
				);
			});

		this.body = body;
	}

	show(entry, record, listing) {
		const { signal } = this;
		const title = titleOf(entry);
		const command = installCommand(entry);
		const releases = new Stack();
		const readme = new Stack({ append: new EmptyState({ loading: true, title: 'Fetching the readme' }) });
		const controls = new Row({ append: [collectButton(entry), ...installControls(entry)] });
		const redrawControls = () => controls.content([collectButton(entry), ...installControls(entry)]);
		const watched = (record.releases ?? []).filter(release => release.assets.length > 0);
		const shares = entry.shares ?? sharing(entry, listing);

		document.title = `${title} :: ender index`;
		collection.subscribe(redrawControls, signal);
		local.subscribe(redrawControls, signal);
		local.ready().then(redrawControls);

		releases.content(watched.map(release => releaseCard(entry, release)));

		this.body.content([
			new Row({
				style: { flexWrap: 'nowrap', alignItems: 'flex-start', gap: theme.space.lg },
				append: [
					avatar(pictureUrl(entry, 192), 96),
					new Stack({
						style: { flex: '1', minWidth: '0', gap: theme.space.sm },
						append: [
							new Heading({ tag: 'h1', textContent: title }),
							new Row({
								append: [
									new Link({
										href: repositoryUrl(entry),
										target: '_blank',
										textContent: `${entry.repo} on ${HOSTS[entry.host ?? 'github'] ?? 'GitHub'}`,
									}),
									...(record.license ? [new Meta({ textContent: record.license })] : []),
								],
							}),
							...(record.description ? [paragraph(record.description)] : []),
							new Row({ append: loadersOf(entry).map(loader => new Chip({ textContent: loader })) }),
						],
					}),
				],
			}),
			...(shares ? [new Warning({ textContent: `It ${shares}: check you have the one you mean` })] : []),
			...(entry.replaced
				? [new Warning({ textContent: 'A jar in one of its releases was changed after publishing' })]
				: []),
			new Row({
				append: [
					new Command({ tag: 'code', textContent: command }),
					new Button({ icon: 'copy', variant: 'flat', title: 'Copy', onPointerPress: () => copyCommand(command) }),
					controls,
				],
			}),
			new Row({
				style: { marginTop: theme.space.md },
				append: [
					stat(count(record.stars ?? 0), 'stars'),
					...(entry.downloads === undefined ? [] : [stat(count(entry.downloads), 'downloads')]),
					...(entry.usedBy ? [stat(count(entry.usedBy), 'used by')] : []),
					stat(date(entry.latest?.published), 'latest release'),
					stat(date(record.created), 'created'),
					stat(date(record.pushed), 'last pushed'),
				],
			}),
			new SectionLabel({ level: 2, textContent: 'Readme', style: { marginTop: theme.space.xl } }),
			readme,
			new SectionLabel({
				level: 2,
				style: { marginTop: theme.space.xl },
				textContent: `The newest ${watched.length === 1 ? 'release' : `${watched.length} releases`} with jars`,
			}),
			new Meta({
				tag: 'p',
				textContent:
					'Each jar was downloaded and read by the crawl. What its code can reach is a finding, not a verdict: an update checker reaches the network.',
			}),
			releases,
		]);

		fetchReadme(entry, signal)
			.then(found => {
				if (signal.aborted) return;

				if (found === undefined) {
					readme.content(new Meta({ tag: 'p', textContent: 'No readme was found at the root of the repository.' }));

					return;
				}

				const prose = new Prose();

				prose.elem.innerHTML = renderReadme(found.markdown, found.sources);
				prose.elem.addEventListener(
					'click',
					event => {
						const anchor = event.target.closest(`a[href^="#${HEADING_PREFIX}"]`);

						if (!anchor) return;

						event.preventDefault();
						prose.elem
							.querySelector(`[id="${CSS.escape(anchor.getAttribute('href').slice(1))}"]`)
							?.scrollIntoView({ behavior: 'smooth' });
					},
					{ signal },
				);
				readme.content(prose);
			})
			.catch(error => {
				if (error.name !== 'AbortError')
					readme.content(new Meta({ tag: 'p', textContent: `The readme did not load: ${error.message}` }));
			});
	}
}
