import { Button, Content, Link, SectionLabel, View, theme } from '@vanilla-bean/components';

import { Command, Meta, Row, Stack, Title, breadcrumbs, copyCommand, siteBar } from './ui';

const SCRIPTS = 'https://raw.githubusercontent.com/fatlard1993/ender-launcher/main';

/** How ender installs in one line, by the shell each system runs it in. */
export const INSTALLS = {
	unix: { label: 'Linux or macOS', command: `curl -fsSL ${SCRIPTS}/install.sh | sh` },
	windows: { label: 'Windows, in PowerShell', command: `irm ${SCRIPTS}/install.ps1 | iex` },
};

export const BREW = 'brew install fatlard1993/tap/ender';

/** Which of INSTALLS a browser's user agent is on: Windows, or a system with sh. */
export const systemOf = (userAgent = '') => (/windows/i.test(userAgent) ? 'windows' : 'unix');

const commandRow = command =>
	new Row({
		append: [
			new Command({ tag: 'code', textContent: command }),
			new Button({ icon: 'copy', variant: 'flat', title: 'Copy', onPointerPress: () => copyCommand(command) }),
		],
	});

export default class GetPage extends View {
	build() {
		const mine = systemOf(navigator.userAgent);
		const others = Object.keys(INSTALLS).filter(system => system !== mine);

		document.title = 'Get ender :: ender index';

		this.content([
			siteBar(),
			new Content({
				column: 900,
				style: { paddingBlock: '12px' },
				append: [
					breadcrumbs({ label: 'Mods', href: `${location.search}#/` }, { label: 'Get ender' }),
					new Stack({
						style: { gap: theme.space.md },
						append: [
							new Title({ tag: 'h1', textContent: 'Get ender' }),
							new Meta({
								tag: 'p',
								textContent:
									'ender is the launcher this index is made for: it installs the mods and packs listed here, and what they need, into Minecraft instances it keeps. It is one file, with nothing else to install; it fetches the Java each game version needs itself.',
							}),
							new SectionLabel({ level: 2, textContent: `On ${INSTALLS[mine].label}` }),
							commandRow(INSTALLS[mine].command),
							new Meta({
								tag: 'p',
								textContent:
									'It downloads the build for your system, checks it against the sha256 its release lists, and installs nothing that differs. ender upgrade brings it up to date later.',
							}),
							new SectionLabel({ level: 2, textContent: 'With Homebrew' }),
							commandRow(BREW),
							...others.flatMap(system => [
								new SectionLabel({ level: 2, textContent: `On ${INSTALLS[system].label}` }),
								commandRow(INSTALLS[system].command),
							]),
							new SectionLabel({ level: 2, textContent: 'Then' }),
							commandRow('ender new my-world -m 26.3'),
							new Meta({
								tag: 'p',
								append: [
									'makes a Fabric instance, and each mod here has the ender add line that puts it in one. To work on ender itself, run it from ',
									new Link({
										href: 'https://github.com/fatlard1993/ender-launcher#getting-started',
										target: '_blank',
										textContent: 'its source',
									}),
									'.',
								],
							}),
						],
					}),
				],
			}),
		]);
	}
}
