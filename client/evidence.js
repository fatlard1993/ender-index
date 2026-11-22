/** A call as a scan records it, without the method it was found in, which a refactor moves without changing anything. */
const callOf = text => text.replace(/ in [^ ]+$/, '');

const flat = record => [
	...new Set(
		Object.values(record ?? {})
			.flat()
			.map(callOf),
	),
];

/**
 * What a jar holds of one finding, as what an explanation of it can be held to: the calls behind a capability or a
 * warning, the hosts its strings name, the classes or entries behind hidden code and unsourced classes, the strings
 * naming other programs' secrets. A network explanation also covers the hosts, since where a mod connects is what one
 * says.
 */
export const evidenceOf = ({ scan, unsourced } = {}, finding) => {
	const calls = (() => {
		if (finding === 'hosts') return [];
		if (finding === 'hidden') return scan?.hidden ?? [];
		if (finding === 'unsourced') return unsourced?.classes ?? [];
		if (finding === 'secrets') return [...new Set(Object.values(scan?.secrets ?? {}).flatMap(flat))];

		return flat(scan?.capabilities?.[finding] ?? scan?.signals?.[finding]);
	})();
	const hosts = finding === 'hosts' || finding === 'network' ? Object.keys(scan?.hosts ?? {}) : [];

	return { calls: calls.toSorted(), hosts: hosts.toSorted() };
};

/** Everything a release's jars hold of a finding, as one record an explanation of it covers. */
export const coveredBy = (assets, finding) => {
	const each = assets.map(asset => evidenceOf(asset, finding));

	return {
		calls: [...new Set(each.flatMap(({ calls }) => calls))].toSorted(),
		hosts: [...new Set(each.flatMap(({ hosts }) => hosts))].toSorted(),
	};
};

/**
 * What a jar holds of a finding that an explanation did not cover, when the explanation says what it covered; none for
 * one approved before explanations kept that, or written ahead of the finding, with nothing yet to hold it to.
 */
export const uncovered = (asset, finding, covers) => {
	if (!covers || covers.calls.length + covers.hosts.length === 0) return [];

	const now = evidenceOf(asset, finding);

	return [
		...now.calls.filter(call => !covers.calls.includes(call)),
		...now.hosts.filter(host => !covers.hosts.includes(host)),
	];
};
