import { expect, test } from 'bun:test';

import { coveredBy, evidenceOf, uncovered } from '../client/evidence';

const asset = (network, hosts = {}) => ({ scan: { capabilities: { network }, hosts } });

test("holds an explanation to a finding's calls, not the methods they sit in, and a network one to its hosts too", () => {
	expect(
		evidenceOf(
			asset({ 'a/A.class': ['java/net/http/HttpClient.send in check'] }, { 'api.modrinth.com': [] }),
			'network',
		),
	).toEqual({ calls: ['java/net/http/HttpClient.send'], hosts: ['api.modrinth.com'] });
	expect(evidenceOf(asset({}, { 'api.modrinth.com': [] }), 'hosts')).toEqual({
		calls: [],
		hosts: ['api.modrinth.com'],
	});
	expect(evidenceOf({ unsourced: { classes: ['a/Sync.class'] } }, 'unsourced').calls).toEqual(['a/Sync.class']);
});

test('covers what a release held when the explanation was approved, across its jars', () => {
	expect(
		coveredBy(
			[
				asset({ 'a/A.class': ['java/net/Socket.<init>'] }),
				asset({ 'b/B.class': ['java/net/http/HttpClient.send in run'] }),
			],
			'network',
		),
	).toEqual({ calls: ['java/net/Socket.<init>', 'java/net/http/HttpClient.send'], hosts: [] });
});

test('says what a later jar has that the explanation does not cover: a new host, a new call', () => {
	const covers = { calls: ['java/net/http/HttpClient.send'], hosts: ['api.modrinth.com'] };
	const later = asset(
		{ 'a/A.class': ['java/net/http/HttpClient.send in check'], 'a/B.class': ['java/net/Socket.<init> in open'] },
		{ 'api.modrinth.com': [], 'collect.example.net': [] },
	);

	expect(uncovered(later, 'network', covers)).toEqual(['java/net/Socket.<init>', 'collect.example.net']);
	expect(
		uncovered(
			asset({ 'a/A.class': ['java/net/http/HttpClient.send in moved'] }, { 'api.modrinth.com': [] }),
			'network',
			covers,
		),
	).toEqual([]);
	expect(uncovered(later, 'network', undefined)).toEqual([]);
	expect(uncovered(later, 'network', { calls: [], hosts: [] })).toEqual([]);
});
