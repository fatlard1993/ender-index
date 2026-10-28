import {
	Button,
	Component,
	Content,
	EmptyState,
	Input,
	Label,
	Link,
	View,
	debounce,
	styled,
	theme,
} from '@vanilla-bean/components';
import { providerOf, rank } from 'ender-launcher/rank';

import { NAME_LONGEST, STORY_LONGEST } from '../src/shot';
import { loadListing } from './data';
import { collectionKey, modPath, titleOf } from './search';
import { TURNSTILE_SITE_KEY, askedFor, loadTurnstile, sendShot, sharingOpen, shrink } from './shots';
import { Chip, Meta, Row, Stack, Title, breadcrumbs, siteBar } from './ui';

const MODS_OFFERED = 6;

const Drop = styled.Component(
	({ colors, radius, space }) => `
		display: grid;
		place-items: center;
		min-height: 180px;
		padding: ${space.md};
		border: 2px dashed ${colors.border};
		border-radius: ${radius.md};
		cursor: pointer;
		text-align: center;

		&.drag-over {
			border-color: ${colors.primary};
		}

		& img {
			display: block;
			max-width: 100%;
			max-height: 360px;
			border-radius: ${radius.sm};
		}
	`,
);

export default class SharePage extends View {
	build() {
		document.title = 'Share a shot :: ender index';

		const body = new Stack({ append: new EmptyState({ loading: true, title: 'Loading the index' }) });

		this.content([
			siteBar(),
			new Content({
				column: 900,
				style: { paddingBlock: '12px' },
				append: [breadcrumbs({ label: 'Mods', href: '#/' }, { label: 'Share a shot' }), body],
			}),
		]);

		if (!sharingOpen()) {
			body.content(
				new EmptyState({
					icon: 'triangle-exclamation',
					title: 'Sharing shots is not open yet',
					message: 'The queue they wait in for review is still being set up',
				}),
			);

			return;
		}

		loadListing()
			.then(listing => !this.signal.aborted && this.form(body, listing))
			.catch(error => {
				if (this.signal.aborted) return;

				body.content(
					new EmptyState({
						icon: 'triangle-exclamation',
						title: 'The index did not load',
						message: error.message,
						action: { textContent: 'Try again', onPointerPress: () => this.render() },
					}),
				);
			});
	}

	form(body, listing) {
		const byKey = new Map(listing.map(entry => [collectionKey(entry), entry]));
		const asked = askedFor(location.search);
		const resolved = ({ keys, ids }) => [
			...new Set([
				...keys.filter(key => byKey.has(key)),
				...ids
					.map(id => providerOf(id, listing))
					.filter(Boolean)
					.map(collectionKey),
			]),
		];
		const unknown = asked.chosen.ids.filter(id => providerOf(id, listing) === undefined);
		const chosen = resolved(asked.chosen);
		const instance = resolved(asked.offered).map(key => byKey.get(key));
		const state = { image: undefined, token: undefined, sending: false };

		const picked = new Row();
		const offered = new Row();
		const drawPicked = () =>
			picked.content(
				chosen.length === 0
					? new Meta({ textContent: 'None yet: find the mods it shows below' })
					: chosen.map(
							key =>
								new Row({
									style: { gap: theme.space.xs, flexWrap: 'nowrap' },
									append: [
										new Link({
											href: `#${modPath(byKey.get(key))}`,
											append: new Chip({ textContent: titleOf(byKey.get(key)) }),
										}),
										new Button({
											icon: 'xmark',
											variant: 'flat',
											title: `Leave out ${titleOf(byKey.get(key))}`,
											onPointerPress: () => {
												chosen.splice(chosen.indexOf(key), 1);
												drawPicked();
												drawOffered(find.elem.value);
												drawReady();
											},
										}),
									],
								}),
						),
			);
		const drawOffered = (query = '') => {
			const open = entry => !chosen.includes(collectionKey(entry));
			const found = query.trim()
				? [...new Set([...rank(instance, query), ...rank(listing, query)])].filter(open).slice(0, MODS_OFFERED)
				: instance.filter(open);

			offered.content([
				...(found.length > 0 && !query.trim() ? [new Meta({ textContent: 'In your instance:' })] : []),
				...found.map(
					entry =>
						new Button({
							variant: 'flat',
							textContent: `+ ${titleOf(entry)}`,
							onPointerPress: () => {
								chosen.push(collectionKey(entry));
								find.elem.value = '';
								drawOffered();
								drawPicked();
								drawReady();
							},
						}),
				),
			]);
		};
		const find = new Input({
			type: 'search',
			placeholder: 'Find a mod it shows',
			onInput: debounce(({ target: { value } }) => drawOffered(value), 200),
		});

		const zone = new Drop({ textContent: 'Drop a screenshot here, paste one, or press to choose' });
		const picture = new Input({
			type: 'file',
			accept: 'image/png,image/jpeg,image/webp',
			style: { display: 'none' },
			dropZone: zone,
			appendTo: zone,
			onFiles: async ([file]) => {
				if (!file) return;

				status.content('Getting the picture ready');

				try {
					state.image = await shrink(file);
					zone.content([
						picture,
						new Component({
							tag: 'img',
							attributes: { src: URL.createObjectURL(state.image), alt: 'The shot to send' },
						}),
					]);
					status.content([]);
				} catch {
					state.image = undefined;
					status.content(`${file.name} could not be read as a picture`);
				}

				drawReady();
			},
		});

		const counter = new Meta({ textContent: `0 of ${STORY_LONGEST}` });
		const story = new Input({
			tag: 'textarea',
			placeholder: 'What happened, or what it shows: the build, the run, the moment',
			attributes: { maxlength: STORY_LONGEST, rows: 5 },
			onInput: ({ target: { value } }) => {
				counter.elem.textContent = `${value.length} of ${STORY_LONGEST}`;
				drawReady();
			},
		});
		const name = new Input({
			placeholder: 'Left empty, it shows as from a player',
			attributes: { maxlength: NAME_LONGEST },
		});

		const check = new Component();
		const status = new Meta({ tag: 'p' });
		const send = new Button({
			textContent: 'Send it to be looked over',
			disabled: true,
			onPointerPress: async () => {
				state.sending = true;
				drawReady();
				status.content('Sending');

				try {
					await sendShot({
						image: state.image,
						story: story.elem.value,
						name: name.elem.value,
						mods: chosen,
						token: state.token,
					});
					this.sent(body);
				} catch (error) {
					status.content(error.message);
					state.sending = false;
					state.token = undefined;
					window.turnstile?.reset(check.elem);
					drawReady();
				}
			},
		});
		const missing = () =>
			[
				chosen.length === 0 && 'the mods it shows',
				!state.image && 'the picture',
				!story.elem.value.trim() && 'its story',
				!state.token && 'the check that a person is sending',
			].filter(Boolean);
		const drawReady = () => {
			send.options.disabled = state.sending || missing().length > 0;
		};

		loadTurnstile()
			.then(turnstile => {
				if (this.signal.aborted) return;

				turnstile.render(check.elem, {
					sitekey: TURNSTILE_SITE_KEY,
					callback: token => {
						state.token = token;
						drawReady();
					},
					'expired-callback': () => {
						state.token = undefined;
						drawReady();
					},
				});
			})
			.catch(error =>
				status.content(`The check that a person is sending did not load (${error.message}), so nothing can be sent`),
			);

		drawPicked();
		drawOffered();

		body.content([
			new Title({ tag: 'h1', textContent: 'Share a shot' }),
			new Meta({
				tag: 'p',
				textContent:
					'A picture from your game and the story behind it, for the pages of the mods it shows. No account is needed. Every shot is looked over before it shows, and nothing you send is public until then.',
			}),
			...(unknown.length > 0
				? [new Meta({ tag: 'p', textContent: `Not in the index, so left out: ${unknown.join(', ')}` })]
				: []),
			new Label({ label: 'The mods it shows', append: new Stack({ append: [picked, find, offered] }) }),
			new Label({
				label: 'The picture',
				append: new Stack({
					append: [
						zone,
						new Meta({ textContent: 'F2 in game saves one to the screenshots folder of its game directory' }),
					],
				}),
			}),
			new Label({ label: 'Its story', append: new Stack({ append: [story, counter] }) }),
			new Label({ label: 'Your name', append: name }),
			check,
			new Row({ append: [send, status] }),
		]);
	}

	sent(body) {
		body.content(
			new EmptyState({
				icon: 'heart',
				title: 'Sent',
				message: "It shows on the mods' pages once it has been looked over",
				action: { textContent: 'Share another', onPointerPress: () => this.render() },
			}),
		);
	}
}
