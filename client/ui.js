import { Component, Notify, copyToClipboard, styled } from '@vanilla-bean/components';

export const count = number => number.toLocaleString('en-US');

export const date = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '');

export const Stack = styled.Component(
	({ space }) => `
		display: flex;
		flex-direction: column;
		gap: ${space.md};
	`,
);

export const Row = styled.Component(
	({ space }) => `
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: ${space.sm};
	`,
);

export const Meta = styled.Component(
	({ colors }) => `
		color: ${colors.muted};
		font-size: 0.85em;
	`,
);

export const Title = styled.Component(
	() => `
		font-weight: bold;
		font-size: 1.1em;
	`,
);

export const Chip = styled.Component(
	({ colors, radius, space }) => `
		border: 1px solid ${colors.border};
		border-radius: ${radius.pill};
		padding: 0 ${space.sm};
		font-size: 0.8em;

		&.finding {
			border-color: ${colors.alpha(colors.warning, 0.6)};
			color: ${colors.warning};
		}

		&.installed {
			border-color: ${colors.alpha(colors.success, 0.6)};
			color: ${colors.success};
		}
	`,
);

export const Warning = styled.Component(
	({ colors }) => `
		color: ${colors.warning};
		font-size: 0.9em;
	`,
);

export const Command = styled.Component(
	({ colors, radius, space }) => `
		background: ${colors.overlay};
		border-radius: ${radius.sm};
		padding: ${space.xs} ${space.sm};
		font-size: 0.9em;
		user-select: all;
		overflow-wrap: anywhere;
	`,
);

/** A repository's picture, or a cube where its host has none to give without a request. */
export const Avatar = styled.Component(
	({ colors, radius }) => `
		flex: none;
		border-radius: ${radius.md};
		background: ${colors.raised};
		object-fit: cover;
	`,
);

export const avatar = (url, size = 48) => {
	const picture = new Avatar({
		tag: url ? 'img' : 'div',
		...(url ? { attributes: { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } } : {}),
		style: { width: `${size}px`, height: `${size}px` },
	});

	// Mod icons are mostly pixel art, which smoothing blurs when it is drawn larger than it was made
	picture.elem.addEventListener('load', () => {
		if (picture.elem.naturalWidth < size) picture.elem.style.imageRendering = 'pixelated';
	});

	return picture;
};

export const loadJson = async (url, signal) => {
	const response = await fetch(url, { signal });

	if (!response.ok) throw new Error(`${url} answered ${response.status}`);

	return response.json();
};

export const copyCommand = async command => {
	const copied = await copyToClipboard(command);

	new Notify({
		intent: copied ? 'success' : 'warning',
		content: copied ? `Copied ${command}` : 'The clipboard is out of reach here; select the command and copy it',
	});
};

export const paragraph = textContent => new Component({ tag: 'p', textContent, style: { margin: 0 } });

/** A repository's own description, or its summary marked with where it came from. */
export const about = found =>
	found === undefined
		? []
		: [
				new Component({
					tag: 'p',
					style: { margin: 0 },
					append: [found.text, ...(found.from ? [new Meta({ tag: 'span', textContent: ` (${found.from})` })] : [])],
				}),
			];
