/**
 * The word an author puts on what the index should leave out: as a topic on a repository, the whole repository; in a
 * release's notes, anywhere, that release. Only someone who can change the repository can do either, so it needs no
 * other proof of who asked.
 */
export const OPT_OUT = 'ender-index-opt-out';

/** The repositories found opting out, each by the day it was last seen doing so. */
export const OPTED_OUT = 'opted-out.json';

/** How long a repository opting out is left before it is looked at again: removing the topic is how it comes back. */
export const OPT_OUT_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

/** Whether a repository, as its host describes it, opts out of the index. */
export const optsOut = repo => (repo?.topics ?? []).some(topic => topic.toLowerCase() === OPT_OUT);

/** Whether a release's notes, as its author wrote them, opt it out of the index. */
export const releaseOptsOut = body => (body ?? '').toLowerCase().includes(OPT_OUT);

/** Whether a repository seen opting out on this day is still left alone. */
export const optedOutOn = (seen, now = Date.now()) => seen !== undefined && now - Date.parse(seen) < OPT_OUT_DAYS * DAY;
