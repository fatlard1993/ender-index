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

const responses = { '/api/players': listing };
const sent = [];

const settle = async (until, tries = 50) => {
	for (let tried = 0; tried < tries && !until(); ++tried) await new Promise(resolve => setTimeout(resolve, 20));
};

let restore;
let local;
let panel;

beforeAll(async () => {
	restore = browser({ responses });

	const answer = globalThis.fetch;

	globalThis.fetch = async (address, options = {}) => {
		sent.push([options.method ?? 'GET', String(address), options.body]);

		return answer(address, options);
	};

	local = await import('../client/local');
	panel = await import('../client/playersPanel');
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
		expect(text).toContain('needs an app registration of your own');
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
