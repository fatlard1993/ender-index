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

afterAll(() => {
	// The page's own record of being served by ender is a module's state, which the next test file would inherit
	local.local.askAgain();
	restore();
});

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

	test('says on the name field why ender refused a player, rather than in a toast', async () => {
		const card = panel.playersPanel(new AbortController().signal);
		const answer = globalThis.fetch;

		globalThis.fetch = async (address, options = {}) =>
			options.method === 'POST'
				? Response.json({ error: 'a name is 3 to 16 letters, digits or _' }, { status: 400 })
				: answer(address, options);
		document.body.append(card.elem);
		await settle(() => card.elem.textContent.includes('Add an offline player'));

		const field = card.elem.querySelector('input[aria-label="Player name"]');

		field.value = 'no';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		[...card.elem.querySelectorAll('button')].find(each => each.textContent.includes('Add an offline')).click();
		await settle(() => card.elem.textContent.includes('was not added'));
		globalThis.fetch = answer;

		expect(card.elem.textContent).toContain('no was not added: a name is 3 to 16 letters, digits or _');
		expect(document.querySelector('.notify, [class*="Notify"]')?.textContent ?? '').not.toContain('was not added');
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

	test("offers a checkout's ender a restart once its folder holds something else, in place of git pull", async () => {
		const kept = responses['/api/upgrade'];
		const text = parts => parts.map(part => part.elem.textContent).join(' ');
		const checkout = changed => ({
			current: '0.4.1',
			latest: '0.4.2',
			how: 'checkout',
			checkout: { changed, version: '0.4.2' },
		});

		expect(text(enderPanel.restartOffer(checkout(true)))).toContain(
			"ender's folder now holds 0.4.2; restart to run it.",
		);
		expect(text(enderPanel.restartOffer(checkout(true)))).toContain('Restart ender web');
		expect(
			text(
				enderPanel.restartOffer({ current: '0.4.2', how: 'checkout', checkout: { changed: true, version: '0.4.2' } }),
			),
		).toContain('has changed since it started');
		expect(enderPanel.restartOffer(checkout(false))).toEqual([]);
		expect(enderPanel.restartOffer({ current: '0.4.1', latest: '0.4.2', how: 'checkout' })).toEqual([]);

		try {
			responses['/api/upgrade'] = checkout(true);
			local.local.askAgain();

			const shown = enderPanel.enderPanel(new AbortController().signal);

			document.body.append(shown.elem);
			await settle(() => shown.elem.textContent.includes('Restart ender web'));

			expect(shown.elem.textContent).toContain('ender 0.4.2 is out; this is 0.4.1.');
			expect(shown.elem.textContent).not.toContain('git pull');
			shown.elem.remove();
		} finally {
			responses['/api/upgrade'] = kept;
			local.local.askAgain();
		}
	});

	test('waits for the restarted ender to answer as another version before the page reloads', async () => {
		const answers = [undefined, { version: '0.2.0' }, { version: '0.2.1' }];

		expect(await local.servedBy('0.2.0', { seconds: 3, ask: async () => answers.shift() })).toBe('0.2.1');
		await expect(local.servedBy('0.2.0', { seconds: 1, ask: async () => ({ version: '0.2.0' }) })).rejects.toThrow(
			'did not come back',
		);

		const restarts = [{ version: '0.4.2', started: 'A' }, undefined, { version: '0.4.2', started: 'B' }];

		expect(
			await local.servedBy('A', { seconds: 3, ask: async () => restarts.shift(), by: answer => answer?.started }),
		).toBe('B');
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

describe('a source build ender held for changed build scripts', () => {
	const failed = {
		id: 'b1',
		title: 'Adding gh:a/b',
		instance: 'family',
		state: 'failed',
		lines: [
			"xx github:a/b's build scripts changed since you allowed building it at c0ffee0:",
			'added: mod.gradle',
			'changed: build.gradle',
			'Compare them with: git diff --no-index /x /y',
			'They run on this machine with your permissions; ender add github:a/b --build allows these. [build-scripts:github:a/b@beef000000]',
		],
	};

	test('is found in a failed job by the mod and commit ender printed, with the scripts it named', () => {
		expect(local.heldBuilds(failed)).toEqual([
			{ key: 'github:a/b', commit: 'beef000000', changes: ['added: mod.gradle', 'changed: build.gradle'] },
		]);
		expect(local.heldBuilds({ lines: ['Mods changed: 3'] })).toEqual([]);
		expect(local.heldBuilds(undefined)).toEqual([]);
	});

	test('is allowed by its mod and commit, as held, and the job run again', async () => {
		responses['/api/builds'] = { allowed: 'github:a/b' };
		responses['/api/jobs/b1/again'] = { job: { id: 'b2', title: 'Adding gh:a/b', state: 'done', lines: [] } };
		sent.length = 0;

		expect((await local.local.allowBuildsAndRetry(failed)).id).toBe('b2');
		expect(sent.map(([method, address, body]) => [method, address.replace(/^.*\/api\//, ''), body])).toEqual([
			['POST', 'builds', JSON.stringify({ key: 'github:a/b', commit: 'beef000000' })],
			['POST', 'jobs/b1/again', undefined],
		]);
	});

	test("shows the diff in its dialog as text, whatever markup a project's scripts hold", async () => {
		const { confirmHeldBuilds } = await import('../client/controls');

		responses['/api/builds?key=github%3Aa%2Fb&commit=beef000000'] = {
			diff: '+<img src=x onerror="alert(1)">\n+<script>alert(2)</script>',
		};

		const asked = confirmHeldBuilds(failed);

		await Bun.sleep(20);

		const dialog = [...document.querySelectorAll('dialog')].at(-1);

		expect(dialog.textContent).toContain('<img src=x onerror="alert(1)">');
		expect(dialog.querySelector('pre img, pre script')).toBeNull();
		expect(dialog.textContent).toContain('changed: build.gradle');

		[...dialog.querySelectorAll('button')].find(button => button.textContent === 'Cancel').click();
		expect(await asked).toBe(false);
	});

	test('is offered beside its instance, naming the scripts that changed', async () => {
		const { heldBuildOffer } = await import('../client/InstancesPage');
		const holder = document.createElement('div');

		for (const part of heldBuildOffer(failed, () => {})) holder.append(part.elem);

		expect(holder.textContent).toContain("github:a/b's build scripts changed since you allowed building it.");
		expect(holder.textContent).toContain('changed: build.gradle');
		expect([...holder.querySelectorAll('button')].map(button => button.textContent)).toContain('See what changed');
	});
});

describe('a jar ender held back', () => {
	const hash = 'cd'.repeat(32);
	const failed = {
		id: 'j1',
		title: 'Adding to family',
		state: 'failed',
		lines: [`!! github:x/y :: not installed: its code names where Discord's login token is kept [sha256:${hash}]`],
	};

	test('is found in a failed job by the hash ender printed, once however often it is said', () => {
		expect(local.heldBack({ ...failed, lines: [...failed.lines, ...failed.lines] })).toEqual([hash]);
		expect(local.heldBack({ lines: ['ok done'] })).toEqual([]);
		expect(local.heldBack(undefined)).toEqual([]);
	});

	test('is trusted by its hash alone, and the job run again as it was started', async () => {
		responses['/api/trust'] = { trusted: hash };
		responses['/api/jobs/j1/again'] = { job: { id: 'j2', title: 'Adding to family', state: 'done', lines: [] } };
		sent.length = 0;

		const job = await local.local.trustAndRetry(failed);

		expect(job.id).toBe('j2');
		expect(sent.map(([method, address, body]) => [method, address.replace(/^.*\/api\//, ''), body])).toEqual([
			['POST', 'trust', JSON.stringify({ sha256: hash })],
			['POST', 'jobs/j1/again', undefined],
		]);
	});

	test('is trusted even when ender web has nothing it can run to install it, which is said as that, not a failure', async () => {
		const original = globalThis.fetch;

		globalThis.fetch = async (address, options = {}) =>
			String(address).endsWith('/again')
				? Response.json(
						{ error: 'Trusted. The instance it made installs it the next time it is updated, from its card.' },
						{ status: 409 },
					)
				: original(address, options);

		try {
			const error = await local.local.trustAndRetry(failed).catch(caught => caught);

			expect(error.trusted).toBe(true);
			expect(error.message).toStartWith('Trusted.');
		} finally {
			globalThis.fetch = original;
		}
	});

	test('is offered again when the page opens afresh, from the newest job of its instance, and not from an older one', async () => {
		responses['/api/ender'] = { version: '0.3.0' };
		responses['/api/instances'] = [{ name: 'survival', type: 'client', minecraft: '26.3', loader: { type: 'fabric' } }];
		responses['/api/jobs'] = [
			{ id: 'newest', title: 'Adding to survival', instance: 'survival', state: 'failed' },
			{ id: 'older', title: 'Adding to survival', instance: 'survival', state: 'failed' },
		];
		responses['/api/jobs/newest?from=0'] = { lines: failed.lines, next: 1 };
		responses['/api/jobs/older?from=0'] = { lines: failed.lines, next: 1 };
		local.local.askAgain();
		sent.length = 0;

		expect(await local.local.ready()).toBe(true);
		expect(local.local.jobFor('survival')?.id).toBe('newest');
		expect(local.heldBack(local.local.jobFor('survival'))).toEqual([hash]);
		expect(sent.some(([, address]) => address.includes('jobs/older'))).toBe(false);
	});

	test('is offered beside its instance only after a second press, said in full first', async () => {
		const { trustOffer } = await import('../client/InstancesPage');
		const ran = [];
		const holder = document.createElement('div');

		document.body.append(holder);
		for (const part of trustOffer(failed, starting => ran.push(starting))) holder.append(part.elem);

		const named = text => [...holder.querySelectorAll('button')].find(button => button.textContent.includes(text));

		expect(holder.textContent).toContain('names where other programs keep logins');
		expect(named('I trust it').style.display).toBe('none');
		named('Install it anyway').click();
		expect(named('I trust it').style.display).toBe('');
		expect(ran).toEqual([]);
		named('I trust it').click();
		expect(ran).toHaveLength(1);
		holder.remove();
	});
});

describe('what an instance installs, on its card', () => {
	test('is grouped and counted, each said in full with where to read more, an optional one with its switch', async () => {
		const { instanceList } = await import('../client/InstancesPage');
		const toggled = [];
		const dropped = [];
		const details = {
			name: 'family',
			mods: [
				{ source: 'github', id: 'a/lib' },
				{ source: 'modrinth', id: 'zoom', optional: true, description: 'Zoom with C' },
				{ source: 'curseforge', id: 'jei', version: '19.0' },
			],
			installed: [
				{ key: 'github:a/lib', source: 'github', id: 'a/lib', name: 'a/lib 2.0', version: '2.0', requested: true },
				{
					key: 'curseforge:jei',
					source: 'curseforge',
					id: 'jei',
					name: 'Just Enough Items',
					version: '19.0',
					requested: true,
				},
				{
					key: 'github:FabricMC/fabric',
					source: 'github',
					id: 'FabricMC/fabric',
					name: 'Fabric API',
					version: '0.100',
					requested: false,
				},
			],
			chosen: ['modrinth:zoom'],
			resourcepacks: [{ source: 'modrinth', id: 'faithful', optional: true, description: 'Sharper textures' }],
			shaderpacks: [{ source: 'modrinth', id: 'bsl' }],
			pack: { source: 'gh:me/pack', mods: ['github:a/lib'] },
		};
		const listing = [
			{
				host: 'github',
				repo: 'a/lib',
				description: 'The library everything leans on',
				latest: { mods: [{ id: 'lib', name: 'A Lib' }] },
			},
		];
		const holder = document.createElement('div');

		for (const part of instanceList(details, listing, {
			onToggle: (...args) => toggled.push(args),
			onDrop: spec => dropped.push(spec),
		}))
			holder.append(part.elem);

		const text = holder.textContent;

		expect(text).toContain('From its pack (1)');
		expect(text).toContain('A Lib');
		expect(text).toContain('The library everything leans on');
		expect(text).toContain('Added to it (1)');
		expect(text).toContain('Just Enough Items');
		expect(text).toContain('pinned at 19.0');
		expect(text).toContain('Optional, offered by its pack (2)');
		expect(text).toContain('Zoom with C');
		expect(text).toContain('Sharper textures');
		expect(text).toContain('Resource and shader packs (1)');
		expect(text).toContain('Brought in for what the others need (1)');
		expect(text).toContain('Fabric API');

		const links = [...holder.querySelectorAll('a')].map(link => [link.textContent, link.getAttribute('href')]);

		expect(links).toContainEqual(['Read more', './mod/github/a/lib']);
		expect(links).toContainEqual(['Read more on CurseForge', 'https://www.curseforge.com/minecraft/mc-mods/jei']);
		expect(links).toContainEqual(['Read more on Modrinth', 'https://modrinth.com/project/zoom']);

		const button = label => [...holder.querySelectorAll('button')].find(found => found.textContent === label);

		button('Turn off').click();
		button('Turn on').click();
		[...holder.querySelectorAll('button')].find(found => found.getAttribute('title') === 'Remove cf:jei').click();

		expect(toggled).toEqual([
			['modrinth:zoom', false],
			['modrinth:faithful', true],
		]);
		expect(dropped).toEqual(['cf:jei']);
	});

	test("shows a Modrinth mod by Modrinth's name, picture and words, the pack's own words first", async () => {
		const { instanceList } = await import('../client/InstancesPage');
		const holder = document.createElement('div');
		const details = {
			mods: [
				{ source: 'modrinth', id: 'sodium-extra' },
				{ source: 'modrinth', id: 'zoomify', optional: true, description: 'Zoom with C' },
			],
			installed: [],
			chosen: [],
		};
		const published = new Map([
			[
				'sodium-extra',
				{ title: 'Sodium Extra', description: 'Options Sodium leaves out', icon: 'https://cdn.example/se.png' },
			],
			['zoomify', { title: 'Zoomify', description: 'A zoom mod', icon: 'https://cdn.example/z.png' }],
		]);

		for (const part of instanceList(details, [], {}, published)) holder.append(part.elem);

		expect(holder.textContent).toContain('Sodium Extra');
		expect(holder.textContent).toContain('Options Sodium leaves out');
		expect(holder.textContent).toContain('Zoom with C');
		expect(holder.textContent).not.toContain('A zoom mod');
		expect([...holder.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual([
			'https://cdn.example/se.png',
			'https://cdn.example/z.png',
		]);
	});

	test('names what it installs from ender alone while the listing has not loaded, and says so when there is nothing', async () => {
		const { instanceList } = await import('../client/InstancesPage');
		const holder = document.createElement('div');
		const details = {
			mods: [{ source: 'github', id: 'a/lib' }],
			installed: [
				{ key: 'github:a/lib', source: 'github', id: 'a/lib', name: 'a/lib 2.0', version: '2.0', requested: true },
			],
		};

		for (const part of instanceList(details, [], {})) holder.append(part.elem);

		expect(holder.textContent).toContain('Its mods (1)');
		expect(holder.textContent).toContain('a/lib2.0 · from GitHub');
		expect([...holder.querySelectorAll('a')].map(link => link.textContent)).toContain('Its repository on GitHub');
		expect(instanceList({ mods: [], installed: [] }, [], {})).toEqual([]);
	});
});

describe("a pack the index's pack maker made", () => {
	test('is handed to ender web whole, with the name the instance takes', async () => {
		const pack = {
			name: 'House',
			minecraft: '26.3',
			loader: 'fabric',
			mods: ['gh:a/b'],
			servers: [{ name: 'O', address: 'o.example' }],
		};

		responses['/api/import'] = { job: { id: 'm1', title: 'Making house', state: 'running', lines: [] } };
		sent.length = 0;

		expect((await local.local.importMadePack(pack, 'house')).id).toBe('m1');
		expect(
			sent.map(([method, address, body]) => [method, address.replace(/^.*\/api\//, ''), JSON.parse(body)]),
		).toEqual([['POST', 'import', { pack, name: 'house' }]]);
	});
});
