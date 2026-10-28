# ender-index

Minecraft mods found where their source lives, described by their own jars, and scanned every night.

Search it at **[fatlard1993.github.io/ender-index](https://fatlard1993.github.io/ender-index/)**, or from a terminal with [ender](https://github.com/fatlard1993/ender-launcher)'s `ender search`. Both rank the same way.

There is nothing to sign up for and nothing to describe twice. A repository is in the index because it looks like a mod and ships like one: loader metadata in its source tree, and jars attached to its releases on GitHub, Codeberg or GitLab. Everything else is read from what it already publishes.

## On your own machine

```sh
ender web
```

The same pages at `http://localhost:7460`, with your ender instances beside them: pick one, and each mod says whether it is installed, with a button to add or drop it, and the collection installs in one press. Every [ender](https://github.com/fatlard1993/ender-launcher) release carries these pages; it answers only pages it served itself, and adds nothing but the `gh:`, `cb:`, `gl:`, `mr:` and `cf:` specs search writes.

To work on the pages themselves, `bun install` and `bun run local` serve them from this checkout, running the `ender` on your `PATH` (or `ENDER`) with the same checks.

## Getting in

1. Keep your loader's metadata where your build expects it: `src/main/resources/fabric.mod.json`, `quilt.mod.json`, or `META-INF/mods.toml` / `META-INF/neoforge.mods.toml`.
2. Attach the built jar to each release. On GitHub, if you publish with `mc-publish`, that is its `github-token` input. On GitLab, a release link whose URL ends in the jar's file name.

Discovery searches GitHub for the metadata once a week. Codeberg and GitLab have no code search across repositories, so there discovery goes by topic: `minecraft-mod`, `fabric-mod`, `fabricmc`, `forge-mod`, `neoforge`, `neoforge-mod` or `quilt-mod`. To be crawled sooner, or without a topic, add a line to [`data/repos.txt`](data/repos.txt) in a pull request: `owner/repo` for GitHub, `codeberg:owner/repo`, or `gitlab:group/project`.

## What is recorded

For each of the newest five releases that carry a jar, every mod jar is downloaded once and recorded with:

- its sha256, computed from the download
- the mods it declares, read from the built jar rather than the source, because only the build has filled in the version and the game versions: loader, id, version, name, Minecraft range, client or both, and required dependencies
- what its code can reach, by [ender](https://github.com/fatlard1993/ender-launcher)'s scanner: `exec`, `classloading`, `native`, `network`, `unsafe`, each with the classes and calls that grant it, plus the hosts its strings name

The same scanner runs in the client when it updates a mod, so a finding here and a finding there mean the same thing.

**These are findings, not verdicts.** An update checker reaches the network; a performance mod uses `Unsafe`. Nothing here is approved or rejected. The one exception is [`data/known-bad.json`](data/known-bad.json), a list of hashes with the reason each is there, which is a fact rather than a judgement.

**A release changed after it was published is recorded.** Assets are tracked by GitHub's asset id, so a jar re-uploaded under the same name is downloaded again. If the bytes differ, the old hash is kept under `replaced` and the crawl reports it as `swapped`. A jar deleted from its release is kept with the date it went missing under `gone`.

## The data

```
data/repos.txt              what is crawled, one owner/repo per line
data/known-bad.json         [{ "sha256", "reason" }]
data/mods/<owner>/<repo>.json   a GitHub repository and its watched releases
data/mods/codeberg.org/...      the same for Codeberg
data/mods/gitlab.com/...        and for GitLab
data/search.json            one summary per repository, for listing without fetching every record
```

A record:

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
					"sha256": "...",
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

An asset may instead carry `error` (it could not be fetched or scanned), `metadataError` (its metadata could not be read), `knownBad`, `replaced` or `gone`. Jars are never rehosted: `url` is the author's own release.

## Running it

```
bun install
bun run crawl                  every repository in data/repos.txt
bun run crawl owner/repo       just these
bun run discover               search GitHub for more; minutes, at ten searches a minute
```

A GitHub token is required, because code search refuses anonymous requests: `GITHUB_TOKEN`, or the `gh` CLI's.

ender is a sibling checkout (`../ender-launcher`), so the scanner is always the one the client runs.

## Nightly

[`.github/workflows/crawl.yml`](.github/workflows/crawl.yml) crawls at 04:17 UTC, discovers on Sundays, and commits whatever changed. A crawl that failed for some repository still commits what it found, then fails the run so the failure is seen.

Each crawl asks GitHub for a repository's details and releases conditionally, against responses kept in `.cache` between runs. An unchanged answer is a 304, which GitHub does not count against the rate limit, so a night's cost is the repositories that changed, not all of them. The Actions token allows 1000 requests an hour; when a crawl reaches the limit it stops, says when the limit resets, and the repositories it did not reach are crawled first the next night. A `CRAWL_TOKEN` secret (a fine-grained token with public read access, 5000 an hour) fills a large index sooner, and the workflow prefers it when present.
