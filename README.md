# ender-index

Minecraft mods found where their source lives, described by their own jars, and crawled every hour; and the modpacks built from them, with where each of their mods really comes from.

Search it at **[fatlard1993.github.io/ender-index](https://fatlard1993.github.io/ender-index/)**, or from a terminal with [ender](https://github.com/fatlard1993/ender-launcher)'s `ender search`. Both rank the same way.

There is nothing to sign up for and nothing to describe twice. A repository is in the index because it looks like a mod and ships like one: loader metadata in its source tree, and jars attached to its releases on GitHub, Codeberg or GitLab. Everything else is read from what it already publishes.

## What it shows

- **Mods.** Search by name, theme or author, filter by Minecraft version, loader, side, host and what a mod's code can reach, and sort as you choose. Each mod has a page of its own: its readme and pictures, its releases and what each jar can reach, with its author's explanation where they gave one, what it needs, works with and won't work with, the packs it is in, its contributors and how each takes support, and more from its author. A fork names the project it was forked from. A mod with no built release is listed by its source when that builds on its own, and says so.
- **Packs.** Modpacks kept in repositories or gists, as packwiz packs, `.mrpack` releases or ender packs, searched, filtered and sorted like mods. Each has a page listing every mod it names: the ones in the index, the ones whose source is known but whose jar comes from Modrinth, and the ones with no source to be found. A pack says so up front when some of its mods come from Modrinth rather than their source, or have no jar anyone can fetch.
- **Player shots.** Screenshots players share with the story behind them, on the pages of the mods they show, apart from the author's own pictures. `ender share`, or the form linked from a mod's page, posts one as a GitHub issue, and it appears once it is approved.
- **Collections.** Gather mods from anywhere in the index, then copy the one line that installs them all, or make them into a pack to copy, download or publish as a gist.
- **Asks.** A button on a mod's page asks for a way to pay its author, when the index knows none, or for a built release, when it has only the source. Each player is counted once, and the count shows beside the button.

## On your own machine

[Get ender](https://fatlard1993.github.io/ender-index/get), then open the Ender icon, or run:

```sh
ender web
```

The same pages at `http://localhost:7460`, with your ender beside them. Every [ender](https://github.com/fatlard1993/ender-launcher) release carries these pages. Started from the icon, it stops by itself a while after the last page closes.

- **Instances.** Make an instance from a list of mods or from a pack, update it, launch it with its install shown step by step, delete it with its worlds kept, choose who plays it, and publish it as a gist. Pick one, and each mod says whether it is installed, with a button to add or drop it; a collection installs in one press.
- **Settings.** Which ender serves the page, a check for a newer release and an update in one press, and ender's players: Microsoft sign in, with nothing to set up, and the active player. On a Mac, it offers to put `ender` in Terminal.
- **GitHub.** Signed in with `gh auth login`, your stars show as a Starred filter and a Star button on each mod's page, and an ask or a pack listing takes one press. **Your mods**, linked from the search page, shows each of your mods, what the index cannot do for it, and how many players have asked.

It answers only pages it served itself, takes requests only as JSON, and installs nothing but the `gh:`, `cb:`, `gl:`, `mr:` and `cf:` specs search writes, or a pack you point it at.

To work on the pages themselves, `bun install` and `bun run local` serve them from this checkout, running the `ender` on your `PATH` (or `ENDER`) with the same checks; `bun run local:dev` reloads as you edit.

## Getting in

The [guide for mod authors](https://fatlard1993.github.io/ender-index/authors) has the whole of it: releases, funding, being found and your page. Its source is [`client/authors.md`](client/authors.md). In short:

1. Keep your loader's metadata where your build expects it: `src/main/resources/fabric.mod.json`, `quilt.mod.json`, or `META-INF/mods.toml` / `META-INF/neoforge.mods.toml`.
2. Attach the built jar to each release. On GitHub, if you publish with `mc-publish`, that is its `github-token` input. On GitLab, a release link whose URL ends in the jar's file name.

Discovery finds a mod nightly, by that metadata or by a topic; [Being found](https://fatlard1993.github.io/ender-index/authors/being-found) says which. To be listed now, [open a List a mod issue](https://github.com/fatlard1993/ender-index/issues/new?template=mod.yml): the repository is crawled and listed within minutes, or the issue says why not. A pull request adding a line to [`data/repos.txt`](data/repos.txt) works too: `owner/repo` for GitHub, `codeberg:owner/repo`, or `gitlab:group/project`.

### Opting out

A repository with the topic `ender-index-opt-out` is dropped from the index and left alone, and a release with `ender-index-opt-out` in its notes is never downloaded. The guide's [Opting out](https://fatlard1993.github.io/ender-index/authors/opting-out) has the details. The repositories found opting out are kept in `data/opted-out.json`, so the crawl looks at each again only weekly.

### Packs

A pack repository on GitHub is found by an `ender.pack.json` or a packwiz `pack.toml`, or by the topics `minecraft-modpack`, `mrpack` or `packwiz`. A pack in a gist, where `ender export --gist` puts one, or in a repository discovery has not found, is listed by [opening a List a pack issue](https://github.com/fatlard1993/ender-index/issues/new?template=pack.yml).

## What is recorded

For the newest five releases that carry a jar, and past those the newest that names each game version in its tag or a jar's name, so a mod released per game version keeps its older builds installable. Every mod jar among them is downloaded once and recorded with:

- its sha256, computed from the download
- the mods it declares, read from the built jar rather than the source, because only the build has filled in the version and the game versions: loader, id, version, name, Minecraft range, client or both, and required dependencies
- what it adds: its blocks, items, entities and the like by name, the kinds of data it carries, like recipes, loot tables and worldgen, and whether it has shaders
- its icon, its download count, and the support links in its metadata
- what its code can reach, by [ender](https://github.com/fatlard1993/ender-launcher)'s scanner: `exec`, `classloading`, `native`, `network`, `unsafe`, each with the classes and calls that grant it, plus the hosts its strings name

The same scanner runs in the client when it updates a mod, so a finding here and a finding there mean the same thing.

With the releases, each repository is recorded with where its readme and pictures are, its contributors and how each takes support, its author's support links, and the project it was forked from. All but the last are read again weekly.

[What each finding means](https://fatlard1993.github.io/ender-index/findings), for players and for authors, is a page of the index. Its source is [`client/findings.md`](client/findings.md).

**These are findings, not verdicts.** An update checker reaches the network; a performance mod uses `Unsafe`. Nothing here is approved or rejected. The one exception is [`data/known-bad.json`](data/known-bad.json), a list of hashes with the reason each is there, which is a fact rather than a judgement.

**A release changed after it was published is recorded.** Assets are tracked by their host's asset id, so a jar re-uploaded under the same name is downloaded again. If the bytes differ, the old hash is kept under `replaced` and the crawl reports it as `swapped`. A jar deleted from its release is kept with the date it went missing under `gone`.

## The data

```
data/repos.txt                  what is crawled, one owner/repo per line
data/modrinth-repos.txt         repositories known only from a Modrinth project's source link, crawled after the rest
data/renames.json               repositories renamed on their host, old name to new
data/known-bad.json             [{ "sha256", "reason" }]
data/mods/<owner>/<repo>.json   a GitHub repository and its watched releases
data/mods/codeberg.org/...      the same for Codeberg
data/mods/gitlab.com/...        and for GitLab
data/icons/<sha256>.<ext>       mods' icons, named by the hash of the image as kept
data/search.json                one summary per repository, for listing without fetching every record
data/tags.json                  the themes search offers, each with the tags folded into it and how many mods carry it
data/sources.json               each Modrinth mod's source repository, by its slug, to point a mod not indexed at its source
data/source-checks.json         when each such repository's source was last checked, and whether it builds
data/modrinth-funding.json      donation links from Modrinth, by repository
data/packs.txt                  pack repositories found on their hosts
data/modrinth-packs.txt         packs known only from a Modrinth modpack's source link
data/submitted-packs.txt        packs players asked the index to list
data/packs/<owner>/<repo>.json  a pack repository and each pack format it has, with what Modrinth says of its mods
data/packs.json                 one summary per pack, for listing
data/pack-pages/<owner>/<repo>.json  a pack's page: each mod it names and where it comes from
data/shots.json                 the player shots published, by the mods they show
data/interest.json              the players who asked, by mod and by what they asked for
data/opted-out.json             repositories found opting out, each by the day it was last seen doing so
data/explanations.json          authors' explanations of their mods' findings, by mod and then by finding
```

A record, trimmed:

```json
{
	"repo": "SwordfishBE/TravelBag",
	"host": "github",
	"description": "...",
	"stars": 1,
	"archived": false,
	"license": "MIT",
	"created": "...",
	"pushed": "...",
	"forkOf": null,
	"readme": "README.md",
	"pictures": ["docs/screenshot.png"],
	"funding": [{ "platform": "ko_fi", "url": "https://ko-fi.com/..." }],
	"contributors": { "commits": 9, "more": 0, "people": [{ "login": "...", "commits": 9, "funding": [] }] },
	"releases": [
		{
			"tag": "1.0.4",
			"published": "...",
			"prerelease": false,
			"assets": [
				{
					"id": 123,
					"name": "TravelBag-1.0.4.jar",
					"url": "https://github.com/.../TravelBag-1.0.4.jar",
					"size": 51234,
					"downloads": 40,
					"sha256": "...",
					"icon": "<sha256>.webp",
					"funding": [],
					"mods": [
						{
							"loader": "fabric",
							"id": "travelbag",
							"version": "1.0.4",
							"minecraft": ">=26.3 <26.4-",
							"environment": "*",
							"depends": ["fabricloader", "minecraft"]
						}
					],
					"content": { "names": { "item": ["Travel Bag"] }, "data": ["recipe"], "shaders": false },
					"scan": {
						"classes": 36,
						"jars": [],
						"capabilities": {
							"network": { "net/travelbag/util/ModrinthUpdateChecker.class": ["java/net/http/HttpClient.send"] }
						},
						"hosts": { "api.modrinth.com": ["..."] },
						"unreadable": []
					}
				}
			]
		}
	]
}
```

An asset may instead carry `error` (it could not be fetched or scanned), `metadataError` (its metadata could not be read), `knownBad`, `replaced` or `gone`. A repository with no built release carries `source`: the commit read and the mods its source declares. Jars are never rehosted: `url` is the author's own release.

## Running it

```
bun install
bun run crawl                  every repository in data/repos.txt
bun run crawl owner/repo       just these
bun run discover               search GitHub for more; minutes, at ten searches a minute
bun run triage                 look over GraphQL for a jar in each repository with no record yet
bun run sources                check whether repositories with no release build from source
bun run lists                  build search.json, packs.json and the rest again from the records on hand
bun test
```

A GitHub token is required, because code search refuses anonymous requests: `GITHUB_TOKEN`, or the `gh` CLI's. `GITLAB_TOKEN` is used for GitLab when set. `CRAWL_MINUTES` gives a crawl a budget, and `CRAWL_PART=packs` crawls the packs alone.

ender is a sibling checkout (`../ender-launcher`), so the scanner is always the one the client runs.

## Crawling

[`.github/workflows/crawl.yml`](.github/workflows/crawl.yml) crawls without stopping, each crawl starting the next as it ends and spending one hour of the App's limit, and commits whatever changed; an hourly schedule restarts the chain should it break, and cancelling a crawl stops it. Before crawling, the run started in the 04:00 UTC hour, and the schedule's 04:17 run when it comes, discovers; the others look over GraphQL for a jar in each repository found with no record, so no REST request is spent on those with none. Then every run checks the repositories found with no release for a source that builds, those that build weekly and the rest monthly.

The crawl itself begins by asking GitHub over GraphQL about every repository it has read, mods and packs alike, a hundred to a query: its details and its newest release. Those with a release it has not read are crawled before the rest; those whose newest release and its assets are as it read them, read in full within the week, are refreshed from that answer alone. The others are read in full over GraphQL too, ten to a query and ahead of where it is, since GraphQL's limit is counted apart from REST's. GraphQL's limit on how fast queries come is waited out, as it resets in a minute; a batch GitHub will not answer otherwise is read over REST. A [List a mod](.github/ISSUE_TEMPLATE/mod.yml) issue crawls and lists one repository straight away, and a [List a pack](.github/ISSUE_TEMPLATE/pack.yml) issue one pack. A crawl that failed for some repository still commits what it found, then fails the run so the failure is seen.

Each crawl asks GitHub for a repository's details and releases conditionally, against responses kept in `.cache` between runs. An unchanged answer is a 304, which GitHub does not count against the rate limit, so a crawl's cost is the repositories that changed, not all of them. The Actions token allows 1000 requests an hour; when a crawl reaches the limit it stops, says when the limit resets, and the repositories it did not reach are crawled first the next run. A `CRAWL_TOKEN` secret (a fine-grained token with public read access, 5000 an hour) fills a large index sooner, and the workflow prefers it when present, leaving its owner 1000 of the hour. A GitHub App installed on this repository's owner is preferred over both: with its ID in the `CRAWL_APP_ID` variable and its private key in the `CRAWL_APP_KEY` secret, the crawl mints the installation's tokens itself, a new one before each lapses, and spends the App's own limit rather than any person's. The App needs no permission past the read-only metadata every App has.

An [Explain a finding](.github/ISSUE_TEMPLATE/explain.yml) issue is read by [`explain.yml`](.github/workflows/explain.yml) when it is opened or edited: from the repository's owner, or a contributor with at least half its commits, it is shown at once, and the `withdrawn` label takes it down.

The asks are counted by [`interest.yml`](.github/workflows/interest.yml), on each ask and every six hours. It posts no notice to an author unless the `NOTICES` variable says `draft`, for a notice posted here, or `live`, for one on the mod's own repository with the `NOTICE_TOKEN` secret.

## License

The code, and the records the crawl writes, are MIT: see [LICENSE](LICENSE). What the records carry of other people's work stays theirs: a mod's name, description, icon and readme belong to its author, and a player shot to the player who shared it. Jars are never rehosted.
