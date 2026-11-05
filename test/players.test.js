import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { browser } from './dom';

const listing = {
	signIn: false,
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
	test('lists who can play, marks the active one, and says sign in needs a registration when ender has none', async () => {
		const card = panel.playersPanel(new AbortController().signal);

		document.body.append(card.elem);
		await settle(() => card.elem.textContent.includes('Kid_2'));

		const text = card.elem.textContent;

		expect(text).toContain('Chase');
		expect(text).toContain('instances play as this one unless given another');
		expect(text).toContain('Play as');
		expect(text).toContain('needs an Azure app registration of your own');
		expect(text).toContain('Application (client) ID');
		expect(text).toContain('Set up Microsoft sign in');
		expect(text).not.toContain('Sign in to Microsoft');
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

	test("saves an Azure app's client id, which makes signing in ready", async () => {
		sent.length = 0;
		await local.local.setClientId('c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb').catch(() => {});

		expect(sent).toContainEqual([
			'PUT',
			'./api/sign-in/client-id',
			JSON.stringify({ clientId: 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb' }),
		]);
	});

	test("shows Microsoft's code and its page from the line ender prints for them", () => {
		expect(
			panel.signInLink([
				':: Sign in to Microsoft',
				'  and enter ABCD1234',
				'  link https://www.microsoft.com/link?otc=ABCD1234',
			]),
		).toEqual({ link: 'https://www.microsoft.com/link?otc=ABCD1234', code: 'ABCD1234' });
		expect(panel.signInLink([':: Sign in to Microsoft'])).toBeUndefined();
	});

	test('once sign in is set up, offers it and a way to change the client id it uses', async () => {
		responses['/api/players'] = { ...listing, signIn: true };
		await local.local.refreshPlayers();

		const card = panel.playersPanel(new AbortController().signal);

		document.body.append(card.elem);
		await settle(() => card.elem.textContent.includes('Sign in to Microsoft'));

		expect(card.elem.textContent).not.toContain('Application (client) ID');

		const change = [...card.elem.querySelectorAll('button')].find(button =>
			button.textContent.includes('Change client id'),
		);

		change.click();
		await settle(() => card.elem.textContent.includes('Application (client) ID'));

		expect(card.elem.textContent).toContain('Application (client) ID');
		expect(card.elem.querySelector('details').hasAttribute('open')).toBe(true);

		responses['/api/players'] = listing;
		await local.local.refreshPlayers();
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
		expect(enderPanel.isNewer('0.2.1', '0.2.0')).toBe(true);
		expect(enderPanel.isNewer('0.10.0', '0.9.9')).toBe(true);
		expect(enderPanel.isNewer('0.2.0', '0.2.0')).toBe(false);
		expect(enderPanel.isNewer('0.1.14', '0.2.0')).toBe(false);
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
