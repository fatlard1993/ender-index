import { Button, Card, Link, theme } from '@vanilla-bean/components';

import { LOADERS, PACK_FORMATS, packPath, repositoryUrl } from './search';
import { Chip, Command, Meta, Row, Stack, Title, Warning, about, copyCommand, count, date } from './ui';

/**
 * What a player should know before installing a pack: how many of its mods come from Modrinth rather than from where
 * their source is, and how many have no jar to be found at all.
 */
export const packWarnings = pack => [
	...(pack.fromModrinth > 0
		? [
				new Warning({
					textContent: `${count(pack.fromModrinth)} of its mods come from Modrinth: the index has no jar of theirs from their source, so the jar is the one their author put on Modrinth.`,
				}),
			]
		: []),
	...(pack.missing > 0
		? [
				new Warning({
					textContent: `${count(pack.missing)} of its mods have no jar the index can find, as CurseForge serves its files only to a client with a key of its own: ender import cannot install those.`,
				}),
			]
		: []),
];

export const packChips = pack => [
	...pack.formats.map(format => new Chip({ textContent: PACK_FORMATS[format] ?? format })),
	...(pack.minecraft ? [new Chip({ textContent: `Minecraft ${pack.minecraft}` })] : []),
	...(pack.loader && pack.loader !== 'vanilla' ? [new Chip({ textContent: LOADERS[pack.loader] ?? pack.loader })] : []),
];

export const packStats = pack =>
	[pack.stars !== undefined && `${count(pack.stars)} stars`, pack.pushed && `last pushed ${date(pack.pushed)}`]
		.filter(Boolean)
		.join(' · ');

export const installRow = (pack, ...beside) =>
	new Row({
		append: [
			new Command({ tag: 'code', textContent: pack.install }),
			new Button({ icon: 'copy', variant: 'flat', title: 'Copy', onPointerPress: () => copyCommand(pack.install) }),
			...beside,
		],
	});

/** A pack in a list: what it is, how much of it the index has, what to know before installing it, and how. */
export const packCard = pack =>
	new Card(
		{},
		new Stack({
			style: { gap: theme.space.sm },
			append: [
				new Row({
					append: [
						new Link({ href: packPath(pack), append: new Title({ textContent: pack.name }) }),
						new Link({ href: repositoryUrl(pack), target: '_blank', textContent: pack.repo }),
						new Meta({ textContent: packStats(pack) }),
					],
				}),
				...about(pack.description ? { text: pack.description } : undefined),
				new Row({
					append: [
						...packChips(pack),
						new Meta({ textContent: `${count(pack.count)} mods, ${count(pack.matched.length)} of them in the index` }),
					],
				}),
				...packWarnings(pack),
				installRow(pack),
			],
		}),
	);
