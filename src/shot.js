/** A mod as the index keys it: its host, then its repository, whose owner on GitLab can be a nested group. */
export const MOD_KEY = /^(github|codeberg|gitlab):[\w.-]+(\/[\w.-]+)+$/;

const HOSTS = { github: 'https://github.com', codeberg: 'https://codeberg.org', gitlab: 'https://gitlab.com' };

export const STORY_LONGEST = 1500;

export const NAME_LONGEST = 40;

export const MODS_MOST = 12;

/** The image types a shot is kept as, by the bytes they begin with. */
const SIGNATURES = {
	webp: bytes => text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 12) === 'WEBP',
	jpg: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
	png: bytes => text(bytes, 1, 4) === 'PNG' && bytes[0] === 0x89,
};

const text = (bytes, start, end) => String.fromCharCode(...bytes.slice(start, end));

/** The extension an image's bytes say it is, or undefined when they are not one a shot is kept as. */
export const imageType = bytes => Object.keys(SIGNATURES).find(type => SIGNATURES[type](bytes));

/** A submission as the queue keeps it, or the reason it cannot be kept. */
export const shotFrom = ({ story, name, mods }) => {
	const told = String(story ?? '').trim();
	const by = String(name ?? '')
		.replaceAll(/\s+/g, ' ')
		.trim();
	const shown = [...new Set(mods ?? [])];

	if (told.length === 0) return { problem: 'A shot needs its story: what happened, or what it shows' };
	if (told.length > STORY_LONGEST) return { problem: `A story is at most ${STORY_LONGEST} characters` };
	if (by.length > NAME_LONGEST) return { problem: `A name is at most ${NAME_LONGEST} characters` };
	if (shown.length === 0) return { problem: 'A shot names the mods it shows' };
	if (shown.length > MODS_MOST) return { problem: `A shot names at most ${MODS_MOST} mods` };

	const unknown = shown.find(mod => !MOD_KEY.test(mod));

	if (unknown !== undefined) return { problem: `${unknown} is not a mod the index lists` };

	return { shot: { story: told, ...(by ? { name: by } : {}), mods: shown } };
};

const RECORD = /^```json\n([\s\S]*?)\n```$/gm;

/**
 * The issue a shot waits in: what a reviewer reads, then the record the publishing step reads back. Editing the record
 * edits what is published.
 */
export const issueOf = (shot, imageUrl) => ({
	title: `A shot of ${shot.mods[0].replace(/^\w+:/, '')}${shot.mods.length > 1 ? ` and ${shot.mods.length - 1} more` : ''}`,
	body: [
		`![The shot](${imageUrl})`,
		shot.story
			.split('\n')
			.map(line => `> ${line}`)
			.join('\n'),
		`From ${shot.name ?? 'a player who left no name'}, of ${shot.mods.map(mod => `[${mod}](${HOSTS[mod.split(':')[0]]}/${mod.replace(/^\w+:/, '')})`).join(', ')}`,
		'Label it `shown` to publish it, or close it to turn it down.',
		`\`\`\`json\n${JSON.stringify(shot, null, '\t')}\n\`\`\``,
	].join('\n\n'),
});

/** The record an issue's body keeps, last in it, after any a story quotes; undefined when it holds none that reads. */
export const recordOf = body => {
	try {
		return JSON.parse([...(body ?? '').matchAll(RECORD)].at(-1)?.[1]);
	} catch {
		return undefined;
	}
};
