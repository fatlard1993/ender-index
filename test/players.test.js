import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { browser } from './dom';

const listing = {
	fallback: 'Player',
	accounts: [
		{ name: 'Chase', kind: 'offline', uuid: 'a', active: true },
		{ name: 'Kid_2', kind: 'offline', uuid: 'b', active: false },
	],
};

const responses = { '/api/players': listing, '/api/upgrade': { current: '0.2.0', latest: '0.2.1', how: 'self' } };
const sent = [];

const settle = async (until, tries = 50) => {
	for (let tried = 0; tried < tries && !until(); ++tried) await new Promise(resolve => setTimeout(resolve, 20));
};

let restore;
let local;
let panel;
let enderPanel;

beforeAll(async () => {
	restore = browser({ responses });

	const answer = globalThis.fetch;

	globalThis.fetch = async (address, options = {}) => {
		sent.push([options.method ?? 'GET', String(address), options.body]);

		return answer(address, options);
	};

	local = await import('../client/local');
	panel = await import('../client/playersPanel');
	enderPanel = await import('../client/enderPanel');
});

afterAll(() => restore());

describe('the players panel', () => {
	test('lists who can play, marks the active one, and offers Microsoft sign in with nothing to set up first', async () => {
		const card = panel.playersPanel(new AbortController().signal);

		document.body.append(card.elem);
		await settle(() => card.elem.textContent.includes('Kid_2'));

		const text = card.elem.textContent;

		expect(text).toContain('Chase');
		expect(text).toContain('instances play as this one unless given another');
		expect(text).toContain('Play as');
		expect(text).toContain('Sign in to Microsoft');
		expect(text).not.toContain('client id');

		const label = card.elem.querySelector('[aria-level="2"]');

		expect(label.textContent).toBe('Players');
		expect(label.className).toContain('SectionLabel');
	});

	test('adds the offline player typed into its field', async () => {
		const card = panel.playersPanel(new AbortController().signal);

		document.body.append(card.elem);
		await settle(() => card.elem.textContent.includes('Add an offline player'));

		const field = card.elem.querySelector('input[aria-label="Player name"]');
		const button = [...card.elem.querySelectorAll('button')].find(each => each.textContent.includes('Add an offline'));

		field.value = 'Steve';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		sent.length = 0;
		button.click();
		await settle(() => sent.some(([method]) => method === 'POST'));

		expect(sent).toContainEqual(['POST', './api/players', JSON.stringify({ name: 'Steve' })]);
		card.elem.remove();
	});

	test('offers each instance the active player or one of its own, showing the one it has', () => {
		const [choice] = panel.playerChoice({ name: 'suite', account: 'Kid_2' });
		const options = [...choice.elem.querySelectorAll('option')].map(option => [option.value, option.label]);

		expect(options).toEqual([
			['', 'plays as the active player (Chase)'],
			['Chase', 'plays as Chase'],
			['Kid_2', 'plays as Kid_2'],
		]);
		expect(choice.elem.querySelector('select')?.value ?? choice.elem.value).toBe('Kid_2');
	});

	test("shows Microsoft's code and its page from the lines ender prints for them", () => {
		expect(
			panel.signInLink([
				':: Sign in to Microsoft',
				'  and enter ABCD1234',
				'  link https://www.microsoft.com/link',
				'  code ABCD1234',
			]),
		).toEqual({ link: 'https://www.microsoft.com/link', code: 'ABCD1234' });
		expect(panel.signInLink([':: Sign in to Microsoft'])).toBeUndefined();
		expect(panel.signInLink(['  link https://www.microsoft.com/link'])).toEqual({
			link: 'https://www.microsoft.com/link',
			code: undefined,
		});
	});

	test('adds an offline player by name and shows what ender answers', async () => {
		sent.length = 0;
		await local.local.addPlayer('Alex');

		expect(sent).toContainEqual(['POST', './api/players', JSON.stringify({ name: 'Alex' })]);
	});

	test('says when ender is too old to manage players, rather than waiting on it', async () => {
		delete responses['/api/players'];
		await local.local.refreshPlayers();

		expect(local.local.players).toBeNull();
		expect(panel.playerChoice({ name: 'suite' })).toEqual([]);

		const card = panel.playersPanel(new AbortController().signal);
		const state = card.elem.querySelector('[class*="EmptyState"]');

		expect(state.textContent).toContain('This ender is too old to manage players here');
	});
});

describe('an open page', () => {
	test('keeps asking ender while it is open, well inside the 15 minutes ender web waits before stopping', async () => {
		let asked = 0;
		const timer = local.keepAlive(() => ++asked, 20);

		await new Promise(resolve => setTimeout(resolve, 70));
		clearInterval(timer);

		expect(asked).toBeGreaterThanOrEqual(2);
		expect(local.STILL_HERE_EVERY).toBeLessThan(15 * 60_000);
	});
});

describe('bringing ender up to date', () => {
	test('a release is newer by its numbers, not its spelling', () => {
		expect(local.isNewer('0.2.1', '0.2.0')).toBe(true);
		expect(local.isNewer('0.10.0', '0.9.9')).toBe(true);
		expect(local.isNewer('0.2.0', '0.2.0')).toBe(false);
		expect(local.isNewer('0.1.14', '0.2.0')).toBe(false);
	});

	test('offers the update when a newer ender is out and ender can replace itself', async () => {
		const shown = enderPanel.enderPanel(new AbortController().signal);

		document.body.append(shown.elem);
		await settle(() => shown.elem.textContent.includes('0.2.1'));

		expect(shown.elem.textContent).toContain('ender 0.2.1 is out; this is 0.2.0.');
		expect(shown.elem.textContent).toContain('Update to 0.2.1');
	});

	test('waits for the restarted ender to answer as another version before the page reloads', async () => {
		const answers = [undefined, { version: '0.2.0' }, { version: '0.2.1' }];

		expect(await local.servedBy('0.2.0', { seconds: 3, ask: async () => answers.shift() })).toBe('0.2.1');
		await expect(local.servedBy('0.2.0', { seconds: 1, ask: async () => ({ version: '0.2.0' }) })).rejects.toThrow(
			'did not come back',
		);
	});
});

describe('the Settings page', () => {
	test('shows the ender serving it, where it lives, and who plays, and marks Settings in the bar when an update is out', async () => {
		responses['/api/ender'] = {
			version: '0.2.0',
			installed: '/Applications/Ender.app',
			data: '/Users/me/.local/share/ender-launcher',
		};
		responses['/api/instances'] = [];
		responses['/api/jobs'] = [];

		local.local.askAgain();

		const { default: SettingsPage } = await import('../client/SettingsPage');
		const page = new SettingsPage({ appendTo: document.body });

		await settle(() => page.elem.textContent.includes('Players') && page.elem.textContent.includes('Ender.app'));

		const text = page.elem.textContent;

		expect(text).toContain('Installed at/Applications/Ender.app');
		expect(text).toContain('Keeps instances, worlds and downloads in/Users/me/.local/share/ender-launcher');
		expect(text).toContain('ender 0.2.1 is out; this is 0.2.0.');
		expect(text).toContain('Players');

		sent.length = 0;
		[...page.elem.querySelectorAll('button')].find(button => button.textContent.includes('Check for updates')).click();
		await settle(() => sent.some(([, address]) => address.endsWith('upgrade?again')));
		expect(sent.map(([, address]) => address)).toContain('./api/upgrade?again');

		const settings = [...page.elem.querySelectorAll('nav a')].find(link => link.textContent.startsWith('Settings'));

		await settle(() => settings.textContent.includes('\u2022'));
		expect(settings.textContent).toBe('Settings \u2022');
		page.destroy();
	});
});

describe("a Mac's Terminal on the Settings page", () => {
	const line = "sudo ln -sf '/Applications/Ender.app/Contents/MacOS/ender' /usr/local/bin/ender";
	const text = rows => rows.map(row => row.elem.textContent).join('');

	test('offers to add ender, with the line to paste instead', () => {
		const rows = enderPanel.terminalRow({ linked: false, line });

		expect(text(rows)).toContain('Add ender to Terminal');
		expect(text(rows)).toContain(line);
	});

	test('says once ender is there, and why when it cannot be linked from where Ender runs', () => {
		expect(text(enderPanel.terminalRow({ linked: true, line }))).toContain('ender works in Terminal');
		expect(text(enderPanel.terminalRow({ linked: false, line, refused: 'drag Ender into Applications' }))).toContain(
			'drag Ender into Applications',
		);
		expect(text(enderPanel.terminalRow({ linked: false, line, refused: 'x' }))).not.toContain('Add ender');
	});

	test('names another ender already at the link and offers nothing that would replace it', () => {
		const rows = enderPanel.terminalRow({ linked: false, line, occupied: '/usr/local/Cellar/ender/0.2.3/bin/ender' });

		expect(text(rows)).toContain(
			"Terminal's ender is /usr/local/Cellar/ender/0.2.3/bin/ender; Ender leaves it in place",
		);
		expect(text(rows)).not.toContain('Add ender');
	});

	test('says so when macOS answers but the link is still not this ender, and offers the button again', async () => {
		responses['/api/terminal'] = { linked: false, line };

		const [row] = enderPanel.terminalRow({ linked: false, line });
		const button = [...row.elem.querySelectorAll('button')].find(each => each.textContent.includes('Add ender'));

		document.body.append(row.elem);
		button.click();
		await settle(() => !button.disabled && document.body.textContent.includes('still not this one'));

		expect(button.disabled).toBe(false);
		expect(document.body.textContent).toContain('still not this one');
	});

	test('turns its button off through the disabled option while macOS asks, and back on after', async () => {
		responses['/api/terminal'] = { linked: false, line };

		const [row] = enderPanel.terminalRow({ linked: false, line });
		const button = [...row.elem.querySelectorAll('button')].find(each => each.textContent.includes('Add ender'));

		document.body.append(row.elem);
		button.click();

		expect(button.disabled).toBe(true);
		await settle(() => !button.disabled);
		expect(button.disabled).toBe(false);
	});

	test('shows nothing for an ender installed some other way', () => {
		expect(enderPanel.terminalRow(undefined)).toEqual([]);
	});

	test('asks ender to link it, and takes how Terminal then stands', async () => {
		responses['/api/terminal'] = { linked: true, line };
		sent.length = 0;
		await local.local.linkTerminal();

		expect(sent).toContainEqual(['POST', './api/terminal', undefined]);
		expect(local.local.ender.terminal).toEqual({ linked: true, line });
	});
});

describe('the instances page', () => {
	let InstancesPage;

	const mount = async () => {
		document.body.innerHTML = '';

		const page = new InstancesPage({ appendTo: document.body });

		await settle(() => document.body.textContent.includes('Make it') && document.body.textContent.includes('survival'));

		return page;
	};

	const buttonNamed = label =>
		[...document.querySelectorAll('button')].find(found => found.textContent.trim() === label);

	const type = (field, value) => {
		field.value = value;
		field.dispatchEvent(new Event('input', { bubbles: true }));
		field.dispatchEvent(new Event('change', { bubbles: true }));
	};

	const posted = () => sent.filter(([method, address]) => method === 'POST' && address.endsWith('api/instances'));

	beforeAll(async () => {
		responses['/api/instances'] = [{ name: 'survival', type: 'client', minecraft: '26.3', loader: { type: 'fabric' } }];
		responses['/api/jobs'] = [];
		responses['version_manifest_v2.json'] = { versions: [{ id: '26.3', type: 'release' }] };
		local.local.askAgain();

		({ default: InstancesPage } = await import('../client/InstancesPage'));
	});

	test("gives a client instance's update first as a checkbox field, its label tied to it", async () => {
		const page = await mount();
		const label = [...document.querySelectorAll('label')].find(found => found.textContent.includes('update first'));
		const box = document.getElementById(label.htmlFor);

		expect(box.type).toBe('checkbox');
		expect(label.nextElementSibling).toBe(box);
		expect(box.classList.contains('vbc-input')).toBe(true);
		expect(box.checked).toBe(true);
		page.destroy();
	});

	test('says on the name field that a new instance needs one, and makes nothing', async () => {
		const page = await mount();

		sent.length = 0;
		buttonNamed('Make it').click();
		await settle(() => document.body.textContent.includes('Give it a name first'));

		expect(document.body.textContent).toContain('Give it a name first');
		expect(posted()).toEqual([]);
		page.destroy();
	});

	test('says on the list that a pack goes in From a pack, and makes nothing', async () => {
		const page = await mount();
		const [name] = document.querySelectorAll('input[placeholder="Its name"]');

		type(name, 'family');
		type(document.querySelector('textarea'), 'ender import gh:me/family-pack');
		sent.length = 0;
		buttonNamed('Make it').click();
		await settle(() => document.body.textContent.includes('goes in From a pack'));

		expect(document.body.textContent).toContain('gh:me/family-pack is a pack; it goes in From a pack above');
		expect(posted()).toEqual([]);
		page.destroy();
	});

	test('makes the instance from the fields once they are right', async () => {
		const page = await mount();

		type(document.querySelector('input[placeholder="Its name"]'), 'My Family');
		type(document.querySelector('textarea'), 'gh:CaffeineMC/lithium');
		sent.length = 0;
		buttonNamed('Make it').click();
		await settle(() => posted().length > 0);

		expect(JSON.parse(posted()[0][2])).toEqual({
			name: 'my-family',
			loader: 'fabric',
			specs: ['gh:CaffeineMC/lithium'],
		});
		page.destroy();
	});

	test('moves mods pasted as a pack into the list, through the field values', async () => {
		const page = await mount();
		const source = document.querySelector('input[placeholder^="A pack\'s index page"]');

		type(source, 'ender add gh:CaffeineMC/lithium');
		buttonNamed('Import').click();
		await settle(() => document.querySelector('textarea').value.includes('lithium'));

		expect(document.querySelector('textarea').value).toBe('gh:CaffeineMC/lithium');
		expect(source.value).toBe('');
		page.destroy();
	});

	test("labels a card's mods and output buttons with what pressing them does", async () => {
		const page = await mount();

		buttonNamed('Show output').click();
		expect(buttonNamed('Hide output')).toBeDefined();
		expect(buttonNamed('Show mods')).toBeDefined();
		page.destroy();
	});
});
