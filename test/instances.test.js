import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { browser } from './dom';

const responses = {
	'/api/ender': { version: '0.2.0' },
	'/api/instances': [{ name: 'survival', type: 'client', minecraft: '26.3', loader: { type: 'fabric' } }],
	'/api/jobs': [],
	'/api/players': { fallback: 'Player', accounts: [] },
	'version_manifest_v2.json': { versions: [{ id: '26.3', type: 'release' }] },
};

const settle = async (until, tries = 50) => {
	for (let tried = 0; tried < tries && !until(); ++tried) await new Promise(resolve => setTimeout(resolve, 20));
};

let restore;
let InstancesPage;

beforeAll(async () => {
	restore = browser({ responses });

	({ default: InstancesPage } = await import('../client/InstancesPage'));
});

afterAll(() => restore());

const mount = async () => {
	document.body.innerHTML = '';

	const page = new InstancesPage({ appendTo: document.body });

	await settle(() => document.body.textContent.includes('Make it') && document.body.textContent.includes('survival'));

	return page;
};

describe('the instances page', () => {
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
});
