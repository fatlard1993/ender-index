import { Content, Link, SectionLabel, View, theme } from '@vanilla-bean/components';

import { Command, Meta, Row, Stack, siteBar } from './ui';

const SCRIPTS = 'https://raw.githubusercontent.com/fatlard1993/ender-launcher/main';

const RELEASE = 'https://github.com/fatlard1993/ender-launcher/releases/latest/download';

/** How ender installs in one line, by the shell each system runs it in. */
export const INSTALLS = {
	unix: { label: 'Linux or macOS', command: `curl -fsSL ${SCRIPTS}/install.sh | sh` },
	windows: { label: 'Windows, in PowerShell', command: `irm ${SCRIPTS}/install.ps1 | iex` },
};

export const BREW = 'brew install fatlard1993/tap/ender';

/**
 * What a system downloads to install ender without a terminal, and what its first open asks, since neither is signed.
 * A Mac's chip is not in its user agent, so both builds are offered.
 */
export const DOWNLOADS = {
	mac: {
		label: 'macOS',
		files: [
			{ label: 'Download for Apple silicon (M1 and later)', href: `${RELEASE}/Ender-mac-arm64.dmg` },
			{ label: 'Download for an Intel Mac', href: `${RELEASE}/Ender-mac-x64.dmg` },
		],
		steps:
			'Open the disk image and drag Ender into Applications. It is not signed by an Apple developer id, so the first time you open it macOS refuses; open System Settings, then Privacy & Security, and choose Open Anyway beside Ender. It opens normally after that.',
	},
	windows: {
		label: 'Windows',
		files: [{ label: 'Download the installer', href: `${RELEASE}/Ender-Setup.exe` }],
		steps:
			'It is not signed, so SmartScreen says Windows protected your PC; choose More info, then Run anyway. It installs for you alone, with no administrator prompt, and puts ender on your PATH for terminals opened afterwards.',
	},
};

/** Which system a browser's user agent is on: Windows, a Mac, or another with sh. */
export const systemOf = (userAgent = '') => {
	if (/windows/i.test(userAgent)) return 'windows';
	if (/macintosh|mac os x/i.test(userAgent)) return 'mac';

	return 'linux';
};

/** The one-line install a system's terminal runs. */
export const installFor = system => INSTALLS[system === 'windows' ? 'windows' : 'unix'];

const commandRow = command => new Row({ append: new Command({ code: command, multiline: true, copyButton: true }) });

const downloadButton = file =>
	new Link({ variant: 'button', href: file.href, icon: 'download', textContent: file.label });

const downloadSection = (system, level = 2) => {
	const download = DOWNLOADS[system];

	return [
		new SectionLabel({ level, textContent: `Download for ${download.label}` }),
		new Row({ style: { flexWrap: 'wrap' }, append: download.files.map(downloadButton) }),
		new Meta({ tag: 'p', textContent: download.steps }),
	];
};

const paragraph = textContent => new Meta({ tag: 'p', textContent });

export default class GetPage extends View {
	build() {
		const mine = systemOf(navigator.userAgent);
		const install = installFor(mine);
		const otherInstall = installFor(mine === 'windows' ? 'linux' : 'windows');
		const otherDownloads = Object.keys(DOWNLOADS).filter(system => system !== mine);

		document.title = 'Get ender :: ender index';

		this.content([
			siteBar(undefined, { label: 'Get ender' }),
			new Content({
				column: 900,
				style: { paddingBlock: theme.space.md },
				append: [
					new Stack({
						style: { gap: theme.space.md },
						append: [
							paragraph(
								'ender is the launcher this index is made for: it installs the mods and packs listed here, and what they need, into Minecraft instances it keeps. It is one file, with nothing else to install; it fetches the Java each game version needs itself.',
							),
							paragraph(
								'However you install it, you get an Ender icon. Opening it shows this index in your browser with your own instances beside it, where you make them, add mods and launch the game. It runs quietly while the page is open, and stops by itself a while after you close it.',
							),
							...(DOWNLOADS[mine] ? downloadSection(mine) : []),
							new SectionLabel({
								level: 2,
								textContent: DOWNLOADS[mine] ? 'Or from a terminal' : `On ${install.label}`,
							}),
							commandRow(install.command),
							paragraph(
								'It downloads the build for your system, checks it against the sha256 its release lists, and installs nothing that differs. It adds the Ender icon to your app menu, and if the folder it installs to is not on your PATH yet, it prints the line that puts it there. ender upgrade brings it up to date later.',
							),
							...(mine === 'windows'
								? []
								: [
										new SectionLabel({ level: 2, textContent: 'With Homebrew' }),
										commandRow(BREW),
										new Meta({
											tag: 'p',
											append: ['Then ', new Command({ code: 'ender desktop' }), ' adds the Ender icon.'],
										}),
									]),
							new SectionLabel({ level: 2, textContent: 'Then' }),
							paragraph('Open Ender, or in a terminal:'),
							commandRow('ender new survival'),
							commandRow('ender launch'),
							new Meta({
								tag: 'p',
								append: [
									'makes an instance on the newest release with Fabric, and plays it. Each mod here has the ender add line that puts it in one. The game plays offline until you sign in, and signing in to Microsoft needs an app registration of your own; ',
									new Link({
										href: 'https://github.com/fatlard1993/ender-launcher#accounts',
										target: '_blank',
										textContent: 'its readme says how',
									}),
									'.',
								],
							}),
							new SectionLabel({ level: 2, textContent: 'On other systems' }),
							...otherDownloads.flatMap(system => downloadSection(system, 3)),
							new SectionLabel({ level: 3, textContent: `On ${otherInstall.label}` }),
							commandRow(otherInstall.command),
							new Meta({
								tag: 'p',
								append: [
									'To work on ender itself, run it from ',
									new Link({
										href: 'https://github.com/fatlard1993/ender-launcher#working-on-ender',
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
