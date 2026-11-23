# ender-index

Minecraft mods found where their source lives, described by their own jars, and crawled every hour; and the modpacks built from them, with where each of their mods really comes from.

Search it at **[fatlard1993.github.io/ender-index](https://fatlard1993.github.io/ender-index/)**, or from a terminal with [ender](https://github.com/fatlard1993/ender-launcher)'s `ender search`. Both rank the same way.

<!-- A screenshot of a mod's page here: its scan with each finding's level and plain words, beside its releases. -->

|  | ender index | Modrinth, CurseForge |
| --- | --- | --- |
| How a mod gets in | found where its source lives, with nothing to sign up for | its author uploads it |
| What it says of a mod | read from the jar: game versions, loaders, sides, dependencies | what its author entered |
| What a jar's code can reach | shown on its page: network, other programs, native code, other programs' logins | not shown |
| A new release | listed within the hour | listed once its author uploads it there |
| Leaving | a topic on the repository, no one to ask | deleting the project |

**What it covers.** 34,460 mods at the last count. 20,027 are read from the jars on their releases. The other 14,433 have no built release, and are listed by what their source says; ender builds one of those only when you allow it. Mods whose jars are on Modrinth or CurseForge alone, as many popular ones are, are found when their project links its source, and a pack's page says which of its mods come from where.

There is nothing to sign up for and nothing to describe twice. A repository is in the index because it looks like a mod and ships like one: loader metadata in its source tree, and jars attached to its releases on GitHub, Codeberg or GitLab. Everything else is read from what it already publishes, and an author who would rather their mod were not listed says so the same way, with a topic on the repository: see [Getting out](#getting-out).

## What it shows

- **Mods.** Search by name, theme or author, filter by Minecraft version, loader, side, host and what a mod's code can reach, and sort as you choose. Each mod has a page of its own: its readme and pictures, its releases and what each jar can reach, with its author's explanation where they gave one and what comes from a library it bundles, what it needs, works with and won't work with, the packs it is in, its contributors and how each takes support, and more from its author. A fork names the project it was forked from. A mod with no built release is listed by its source when that builds on its own, and says so.
- **Packs.** Modpacks kept in repositories or gists, as packwiz packs, `.mrpack` releases or ender packs, searched, filtered and sorted like mods. Each has a page listing every mod it names: the ones in the index, the ones whose source is known but whose jar comes from Modrinth, and the ones with no source to be found. A pack says so up front when some of its mods come from Modrinth rather than their source, or have no jar anyone can fetch. Its page also shows who made it and its version, the loader version it pins and the memory it asks for, the mods it offers as optional, its resource and shader packs, and the servers it adds.
- **Player shots.** Screenshots players share with the story behind them, on the pages of the mods they show, apart from the author's own pictures. `ender share`, or the form linked from a mod's page, posts one as a GitHub issue, and it appears once it is approved.
- **Collections.** Gather mods from anywhere in the index, then copy the one line that installs them all, or make them into a pack to copy, download or publish as a gist.
- **Asks.** A button on a mod's page asks for a way to pay its author, when the index knows none, or for a built release, when it has only the source. Each player is counted once, and the count shows beside the button.

## On your own machine

[Get ender](https://fatlard1993.github.io/ender-index/get), then open the Ender icon, or run:

```sh
ender web
```

The same pages at `http://localhost:7460`, with your ender beside them. Every [ender](https://github.com/fatlard1993/ender-launcher) release carries these pages. Started from the icon, it stops by itself a while after the last page closes.

- **Instances.** Make an instance from a list of mods or from a pack, update it, launch it with its install shown step by step, delete it with its worlds kept, choose who plays it, and publish it as a gist. Pick one, and each mod says whether it is installed, with a button to add or drop it; a collection installs in one press. An instance's card lists what its pack offers as optional and turns each on or off, offers a source build held for changed build scripts with the diff, and offers to trust a jar held back for naming other programs' logins.
- **Settings.** Which ender serves the page, a check for a newer release and an update in one press, and ender's players: Microsoft sign in, with nothing to set up, and the active player. On a Mac, it offers to put `ender` in Terminal.
- **GitHub.** Signed in with `gh auth login`, your stars show as a Starred filter and a Star button on each mod's page, and an ask or a pack listing takes one press. **Your mods**, linked from the search page, shows each of your mods, what the index cannot do for it, and how many players have asked.

It answers only pages it served itself, takes requests only as JSON, and installs nothing but the `gh:`, `cb:`, `gl:`, `mr:` and `cf:` specs search writes, or a pack you point it at.

To work on the pages themselves, `bun install` and `bun run local` serve them from this checkout, running the `ender` on your `PATH` (or `ENDER`) with the same checks; `bun run local:dev` reloads as you edit.

## Getting in

The [guide for mod authors](https://fatlard1993.github.io/ender-index/authors) has the whole of it: releases, funding, being found and your page. Its source is [`client/authors.md`](client/authors.md). In short:

1. Keep your loader's metadata where your build expects it: `src/main/resources/fabric.mod.json`, `quilt.mod.json`, or `META-INF/mods.toml` / `META-INF/neoforge.mods.toml`.
2. Attach the built jar to each release. On GitHub, if you publish with `mc-publish`, that is its `github-token` input. On GitLab, a release link whose URL ends in the jar's file name.

Discovery finds a mod nightly, by that metadata or by a topic; [Being found](https://fatlard1993.github.io/ender-index/authors/being-found) says which. To be listed now, [open a List a mod issue](https://github.com/fatlard1993/ender-index/issues/new?template=mod.yml): the repository is crawled and listed within minutes, or the issue says why not. A pull request adding a line to [`data/repos.txt`](https://github.com/fatlard1993/ender-index/blob/data/repos.txt) works too: `owner/repo` for GitHub, `codeberg:owner/repo`, or `gitlab:group/project`.

### Packs

A pack repository on GitHub is found by an `ender.pack.json` or a packwiz `pack.toml`, or by the topics `minecraft-modpack`, `mrpack` or `packwiz`. A pack in a gist, where `ender export --gist` puts one, or in a repository discovery has not found, is listed by [opening a List a pack issue](https://github.com/fatlard1993/ender-index/issues/new?template=pack.yml).

An ender pack names the game version, the loader and the mods chosen, and can also pin the loader's version, ask for memory, offer mods and packs as optional with a line on what each adds, carry resource and shader packs, and add servers to the multiplayer list. A pack in a repository can carry config files too, which reach players on update unless they edited them. [The ender pack format](https://github.com/fatlard1993/ender-launcher#the-ender-pack-format) lists every field, and [What packs leave out, and why](https://github.com/fatlard1993/ender-launcher#what-packs-leave-out-and-why) answers for what it does not take: commands and JVM arguments, which would run a stranger's code; several game versions in one pack; worlds and a world's own data packs, though data packs for every world travel as files; and a side written for each mod, which its jar already says. A collection's **Make a pack** writes all of it, and **Make an instance of it** in `ender web` makes an instance of the whole pack. A packwiz pack or an `.mrpack` is read for the same things where its format says them.

## Getting out

An author takes a mod out of the index where it was found, with no account and no one to ask:

- **The whole repository:** the topic `ender-index-opt-out`, on GitHub, Codeberg or GitLab. The next crawl to reach it drops its page, its releases and its place in search, usually within an hour or two, or within the week for a mod listed only by its source; a pack repository is dropped the same way. It is looked at again weekly, and listed again once the topic is gone, or at once by a List a mod issue.
- **One release:** `ender-index-opt-out` anywhere in its notes, as `<!-- ender-index-opt-out -->` to keep it out of sight. Its jars are never downloaded, and one read before is dropped, while the rest of the mod stays listed.

Opting out takes a mod out of the index, not off its releases: `ender add gh:owner/repo` still installs from them. What the index keeps of a repository that opts out is its name and the day it was last seen opting out, in [`data/opted-out.json`](https://github.com/fatlard1993/ender-index/blob/data/opted-out.json), so it knows to leave it alone; records kept before stay in this repository's history. The guide's [Opting out](https://fatlard1993.github.io/ender-index/authors/opting-out) has the rest.

## Reports and takedowns

- **A jar that does harm:** [open a report](https://github.com/fatlard1993/ender-index/issues/new?template=report.yml). Once confirmed, its sha256 goes in [`data/known-bad.json`](https://github.com/fatlard1993/ender-index/blob/data/known-bad.json) with the reason; on the next list every copy of it in the index is marked, its page says so in red, and ender refuses to install it.
- **Something shown that should not be,** as a takedown from someone other than the mod's author: open a report the same way. The repository goes in [`data/withheld.json`](https://github.com/fatlard1993/ender-index/blob/data/withheld.json) with the reason; the crawl leaves it alone, and its record, mod or pack, is gone on the next list. An author needs none of this: a topic takes their mod out, as [Getting out](#getting-out) says.
- **A player shot:** open a report, or comment on the shot's issue, linked beside it; taking the `shown` label off takes it down on the next run.
- **An author's explanation:** the `withdrawn` label takes it down at once.

## What is recorded

For the newest five releases that carry a jar, and past those the newest that names each game version in its tag or a jar's name, so a mod released per game version keeps its older builds installable. Every mod jar among them is downloaded once and recorded with:

- its sha256, computed from the download
- the mods it declares, read from the built jar rather than the source, because only the build has filled in the version and the game versions: loader, id, version, name, Minecraft range, client or both, and required dependencies
- what it adds: its blocks, items, entities and the like by name, the kinds of data it carries, like recipes, loot tables and worldgen, and whether it has shaders
- its icon, its download count, and the support links in its metadata
- what its code can reach, by [ender](https://github.com/fatlard1993/ender-launcher)'s scanner: `exec`, `classloading`, `native`, `network`, `unsafe`, each with the classes and calls that grant it, plus the hosts its strings name
- what it warns of, which can go either way: a chat `webhook`, the `session` token, `persistence` past the game, the `clipboard`, code `hidden` under other names, an entry point reaching anything in its static `initializer`, and a `zip` two readers would read differently
- on GitHub, the classes reaching the network or other programs that the repository at the release's tag has no source for, beside code that does have it (`unsourced`): one request for the tag's files per new release
- where other programs keep logins, if its code names any: Discord's token, a browser's saved logins, a wallet. No mod has a reason to, so ender will not install such a jar unless its player trusts it
- the version of the scanner that read it

The same scanner runs in the client when it installs and updates a mod, so a finding here and a finding there mean the same thing. A jar keeps the findings of the scanner that read it: when the scanner learns more, old findings stay true, and a jar is read again only when someone [asks for a rescan](https://github.com/fatlard1993/ender-index/issues/new?template=rescan.yml) of its mod, or the `RESCAN` repository variable is set to `full` or `throttled` (a share of old jars each crawl, so new releases never wait), until it is removed.

With the releases, each repository is recorded with where its readme and pictures are, its contributors and how each takes support, its author's support links, and the project it was forked from. All but the last are read again weekly.

[What each finding means](https://fatlard1993.github.io/ender-index/findings), for players and for authors, is a page of the index. Its source is [`client/findings.md`](client/findings.md).

**These are findings, not verdicts.** An update checker reaches the network; a performance mod uses `Unsafe`. Nothing here is approved or rejected. The one exception is [`data/known-bad.json`](https://github.com/fatlard1993/ender-index/blob/data/known-bad.json), a list of hashes with the reason each is there, which is a fact rather than a judgement.

**A release changed after it was published is recorded.** Assets are tracked by their host's asset id, so a jar re-uploaded under the same name is downloaded again. If the bytes differ, the old hash is kept under `replaced` and the crawl reports it as `swapped`. A jar deleted from its release is kept with the date it went missing under `gone`.

### How findings are shown

On a mod's page and its search card, each finding says how much it should make a player look, **Common**, **Worth a look** or **Unusual**, with what it usually means in a few plain words: "talks to the internet: usually update checks, skins, voice chat or telemetry". Opened, it gives the finding's own name, the classes and calls behind it, and the method each call is in. [What each finding means](https://fatlard1993.github.io/ender-index/findings) has the scale and every finding.

- **Alarms**, in red at the top of the page: a jar whose code names where other programs keep logins, which ender installs only once its player trusts it, and a jar on the known-bad list, which ender refuses from any source.
- **Libraries**: a finding only in a jar the mod carries says so, and one only in a package that looks like a library's says that is a guess.
- **Changes**: a release that found something the one before did not says so, and each jar says which scanner read it, with a way to ask for a rescan.
- **Author explanations**: a mod's author can explain a finding in their own words, looked over and approved before it shows, labelled as theirs and with the release it was written for. When a later jar reaches past what it covered, a call or a host it never mentioned, the page says so beside it.

## The data

```
data/index.json                 the data's shape version and each file a launcher reads, with its schema
data/repos.txt                  what is crawled, one owner/repo per line
data/modrinth-repos.txt         repositories known only from a Modrinth project's source link, crawled after the rest
data/renames.json               repositories renamed on their host, old name to new
data/known-bad.json             jars confirmed to do harm: [{ "sha256", "reason" }]
data/withheld.json              repositories withheld by hand, as takedowns, by repos.txt line: { "owner/repo" or "codeberg:owner/repo": "reason" }
data/mods/<owner>/<repo>.json   a GitHub repository and its watched releases
data/mods/codeberg.org/...      the same for Codeberg
data/mods/gitlab.com/...        and for GitLab
data/releases/...               each record's releases alone, beside it: what a launcher picks a jar by, a third of its size
data/icons/<sha256>.<ext>       mods' icons, named by the hash of the image as kept
data/search.json                one summary per repository, for listing without fetching every record
data/providers.json             each mod id's claimants, as placing a dependency weighs them, a fifth of search.json's size
data/changes.json               records whose releases changed in the last week, and when, so a launcher asks only for those
data/releases-seen.txt          what the lists last saw of each record's releases, to tell a change from a rewrite
data/tags.json                  the themes search offers, each with the tags folded into it and how many mods carry it
data/sources.json               each Modrinth mod's source repository, by its slug, to point a mod not indexed at its source
data/source-checks.json         when each such repository's source was last checked, and whether it builds
data/modrinth-funding.json      donation links from Modrinth, by repository
data/modrinth-ids.json          Modrinth project ids, each to the repository its source links
data/modrinth-no-jars.json      repositories known from Modrinth with no jar in their newest releases, each by the day looked at
data/discovery-slices.json      where the nightly code search stopped, and the bands it searches in
data/packs.txt                  pack repositories found on their hosts
data/modrinth-packs.txt         packs known only from a Modrinth modpack's source link
data/submitted-packs.txt        packs players asked the index to list
data/packs/<owner>/<repo>.json  a pack repository and each pack format it has, with what Modrinth says of its mods
data/packs.json                 one summary per pack, for listing
data/pack-pages/<owner>/<repo>.json  a pack's page: each mod it names and where it comes from
data/packs/gist/<id>.json       a pack kept in a gist, by the gist's id
data/pack-pages/gist/<owner>/<id>.json  its page
data/shots.json                 the player shots published, by the mods they show
data/shots/<n>.webp             each published shot's picture
data/interest.json              the players who asked, by mod and by what they asked for
data/notices.json               the notices drafted for authors, by mod, so each is drafted once
data/opted-out.json             repositories found opting out, each by the day it was last seen doing so
data/checks.json                when the crawl last looked at each repository's contributors, funding, pictures and counts
data/explanations.json          authors' explanations of their mods' findings, by mod and then by finding; absent until one is approved
```

The pages on GitHub Pages read a copy of `search.json` their build puts beside them, so their visitors are not served the listing from the `data` branch, which every launcher reads; `ender web` and a local build read the branch's.

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

Each file a launcher reads has a JSON Schema in [`schemas/v1/`](schemas/v1), and [`data/index.json`](https://github.com/fatlard1993/ender-index/blob/data/index.json) names them. Each shape version keeps its own folder, so version 1's schemas stay where they are after a version 2. The tests check every published file against its schema. A change to the code fails CI before it is published; a crawl publishes its data first and checks it right after, so data that breaks a schema turns that crawl's run red within the hour.

## For launchers

The index is meant to be built on: any launcher can read it the way ender does. Everything is static JSON under `https://raw.githubusercontent.com/fatlard1993/ender-index/data/`, the `data` branch, served with ETags, so an unchanged file costs one small request. Start from `index.json` and compare its `schema` with the version your code reads. ender, the reference consumer, says so when the index's is newer and reads on, since fields are added without raising it; refusing is as fair a choice.

**Start from `index.json`.** When it names `data`, an https address, that is where every other file is served now: read them there, and remember it for when the manifest cannot be read. It is how the data can move to another host with no launcher release; ender follows it, and reads an address its player set as it is.

**From a mod id, a loader and a game version to a jar:**

1. **Find the repository.** Each entry in `search.json` names the mod ids its newest release declares, in `latest.mods[].id` and `latest.provides`, and its record by `repo` and `host`. More than one repository can claim an id, such as a fork or a copy, so keep the repository a player chose once they have chosen. An entry with `fromSource` has no built release: its record's `source` names the commit read and the mods it declares. Skip it, or build it only when the player allows, as ender does.
2. **Read its record:** `mods/<owner>/<repo>.json` on GitHub, `mods/codeberg.org/<owner>/<repo>.json` and `mods/gitlab.com/<path>.json` elsewhere. An old name is in `renames.json`. To pick a jar, `releases/` in place of `mods/` holds the same releases without their notes, scans and counts, a third of the size; ender reads that. To keep a record up to date without asking for each one, read `changes.json`: every record whose releases changed since its `since`, with when. A record you read at or after `since` and that is not listed with a later time is as you have it; ender reads it this way, and asks for the rest.
3. **Pick a release.** Go newest first by `published`, and skip `prerelease` unless the player wants one.
4. **Pick a jar.** Skip any asset with `error`, `gone` or `knownBad`. A jar fits when one of its `mods` has your loader (a Fabric mod loads on Quilt too) and its `minecraft` range takes your game version. The range is the jar's own, verbatim: a Fabric or Quilt range with `||` between alternatives, or a Forge or NeoForge Maven range like `[1.20.1,1.21)`. ender's reading of both is [`src/mods/range.js`](https://github.com/fatlard1993/ender-launcher/blob/main/src/mods/range.js) in ender-launcher. A jar that declares no range is taken only when nothing declares a fit, and then only when its file name names the game version or its repository never declares one.
5. **Download and check it.** Download `url`, the author's own release asset, and refuse it unless it matches `sha256`. An asset with `replaced` was re-uploaded once; `sha256` is the jar it is now.
6. **Resolve what it needs.** `depends` holds the mod ids it requires. `providers.json` places each without `search.json`: an id's claimants are in the order ender weighs them, and ender takes the first whose `targets` fit the instance and that is `established`, marked `author`, or has the same owner as the mod requiring it. Any jar can declare any mod id, so a claim alone is not taken.

**What a consumer is expected to honor:**

- **Known-bad jars.** Refuse to install any jar whose sha256 is in `known-bad.json`, wherever it came from, not only the index. Records mark these with `knownBad` too, but the list is the authority.
- **Opt-outs and takedowns are already applied.** A repository that opted out or was withheld is in neither `search.json` nor `mods/`. A copy you cached is not: when a repository leaves `search.json`, stop offering it. `opted-out.json` and `withheld.json` say why it left.
- **Findings are evidence, not verdicts.** `scan` records what a jar's code reaches. Show it or not; [What each finding means](https://fatlard1993.github.io/ender-index/findings) explains each. ender refuses a known-bad jar outright, and a jar with `secrets` until its player trusts it.
- **Authors' work stays theirs.** Link to a mod's repository, and credit its author for its name, description and icon, as [License](#license) says.

## Stability

`schema` in `data/index.json` is the version of the data's shape. It is 1.

- **Fields are only added.** A new field, a new finding name, or a new value where a list is open, such as a funding platform, can appear in any crawl. Ignore what you do not know.
- **Two lists are closed:** a mod's `host` (`github`, `codeberg`, `gitlab`) and its `environment` (`*`, `client`, `server`). A pack's `host` is open: `github` or `gist` so far. A launcher needs every value of both to find a record and to decide what to install, so a new value in either raises `schema`.
- **A change that could break you raises `schema`:** a field removed or renamed, a type or meaning changed, or a file moved. It is announced below at least 30 days before it is published.
- **The schemas are the contract,** and the tests hold every published file to them.
- **Covered:** `index.json`, `search.json`, `mods/`, `known-bad.json`, `withheld.json`, `opted-out.json`, `renames.json`, `explanations.json`, `providers.json`, `changes.json`, `packs.json`, `packs/` and `pack-pages/`: every file a launcher reads.

Changes announced:

- **2026-11-22: the data moved to its own branch.** It is at `https://raw.githubusercontent.com/fatlard1993/ender-index/data/`, the `data` branch, whose history is made one commit each night so the repository stops growing with every crawl. The old address, `.../main/data/`, is copied there once a day until 2026-12-22 and then no longer updated. The files and their shape are the same, so `schema` stays 1; ender from 0.4 reads the new address.

## Running it

`data/` is the `data` branch, which the crawl and every listing commit to. Until 2026-12-22, `main` also carries a copy of it a day old; after that, check it out where the code reads it with `git worktree add data data`, and `scripts/data-push` commits and pushes what changed there.

```
bun install
bun run crawl                  every repository in data/repos.txt
bun run crawl owner/repo       just these
bun run discover               search GitHub for more; minutes, at ten searches a minute
bun src/discover.js --modrinth  read every Modrinth mod's source link; half an hour
bun run triage                 look over GraphQL for a jar in each repository with no record yet
bun run sources                check whether repositories with no release build from source
bun run lists                  build search.json, packs.json and the rest again from the records on hand
bun test
```

A GitHub token is required, because code search refuses anonymous requests: `GITHUB_TOKEN`, or the `gh` CLI's. `GITLAB_TOKEN` is used for GitLab when set. `CRAWL_MINUTES` gives a crawl a budget, and `CRAWL_PART=packs` crawls the packs alone.

ender is a sibling checkout (`../ender-launcher`), so the scanner is always the one the client runs.

## Crawling

[`.github/workflows/crawl.yml`](.github/workflows/crawl.yml) crawls without stopping, each crawl starting the next as it ends and spending one hour of the App's limit, and commits whatever changed; an hourly schedule restarts the chain should it break, and cancelling a crawl stops it. Before crawling, the run started in the 04:00 UTC hour, and the schedule's 04:17 run when it comes, discovers, within forty minutes, and then reads every Modrinth mod's source link, within forty-five. Every run then looks over GraphQL for a jar in each repository found with no record, so no REST request is spent on those with none. Then every run checks the repositories found with no release for a source that builds, those that build weekly and the rest monthly.

The crawl itself begins by asking GitHub over GraphQL about every repository it has read, mods and packs alike, a hundred to a query: its details and its newest release. Those with a release it has not read are crawled before the rest; those whose newest release and its assets are as it read them, read in full within the week, are refreshed from that answer alone. The others are read in full over GraphQL too, ten to a query and ahead of where it is, since GraphQL's limit is counted apart from REST's. GraphQL's limit on how fast queries come is waited out, as it resets in a minute; a batch GitHub will not answer otherwise is read over REST. A [List a mod](https://github.com/fatlard1993/ender-index/issues/new?template=mod.yml) issue crawls and lists one repository straight away, and a [List a pack](https://github.com/fatlard1993/ender-index/issues/new?template=pack.yml) issue one pack. A crawl that failed for some repository still commits what it found, then fails the run so the failure is seen. A repository's stars, download counts and last push are taken again once a day, and its new releases as soon as a crawl sees them; when it last looked at each is kept in `checks.json`, apart from its record, so a look that finds nothing new leaves the record as it was.

Each crawl asks GitHub for a repository's details and releases conditionally, against responses kept in `.cache` between runs. An unchanged answer is a 304, which GitHub does not count against the rate limit, so a crawl's cost is the repositories that changed, not all of them. The Actions token allows 1000 requests an hour; when a crawl reaches the limit it stops, says when the limit resets, and the repositories it did not reach are crawled first the next run. A `CRAWL_TOKEN` secret (a fine-grained token with public read access, 5000 an hour) fills a large index sooner, and the workflow prefers it when present, leaving its owner 1000 of the hour. A GitHub App installed on this repository's owner is preferred over both: with its ID in the `CRAWL_APP_ID` variable and its private key in the `CRAWL_APP_KEY` secret, the crawl mints the installation's tokens itself, a new one before each lapses, and spends the App's own limit rather than any person's. The App needs no permission past the read-only metadata every App has.

An [Explain a finding](https://github.com/fatlard1993/ender-index/issues/new?template=explain.yml) issue is read by [`explain.yml`](.github/workflows/explain.yml) when it is opened or edited: from someone who speaks for the repository (its owner, a contributor with at least half its commits, an account that published one of its releases, or a public member of the owning organization who made some of its commits), it waits for the `approved` label, which publishes its words as they stand. Words changed after that take the label off again, the `withdrawn` label takes it down, and one saying the finding is wrong is labelled `refine`. Each approval records what the explanation covers, the calls behind the finding and, for network or hosts, the hosts, in the newest release; a later jar reaching past that is flagged beside it on the page.

The asks are counted by [`interest.yml`](.github/workflows/interest.yml), on each ask and every six hours. The index posts nothing on a mod's repository, as the guide promises its authors: the count shows on the mod's page, and this repository's owner reaches out to its author once enough players have asked. With the `NOTICES` variable set to `draft`, the workflow drafts each notice as an issue here, for the owner to send the author themselves.

## License

The code, and the records the crawl writes, are MIT: see [LICENSE](LICENSE). What the records carry of other people's work stays theirs: a mod's name, description, icon and readme belong to its author, and a player shot to the player who shared it. Jars are never rehosted.
