The index lists Minecraft mods from the repositories their authors keep, on GitHub, Codeberg and GitLab, and ender installs them from there. There is no account to make and nothing to upload: what your repository already publishes is what players see. These are the pieces that make the most of it.

## Releases

Attach the built jar to a release. A release is where the index and ender take a mod from; a jar in a branch, a CI artifact or a download link in the readme is not read. On GitHub, if you publish with `mc-publish`, its `github-token` input does this; on GitLab, a release link whose URL ends in the jar's file name counts.

- **One release, one or more jars.** Each jar is downloaded and read: what loader and game versions it supports comes from its own `fabric.mod.json`, `quilt.mod.json` or `mods.toml`, not from the release's name.
- **Name the game version** in the tag or the jar's name, like `mymod-1.4.0+1.21.4.jar`. The crawl reads the newest five releases, and past those the newest that names each game version, so a mod released per game version keeps its older builds installable.
- **Publish the mod jar plain.** Jars ending `-sources`, `-javadoc`, `-dev`, `-api`, `-slim` or `-shadow` are skipped as gradle's by-products.
- **Drafts are not read; prereleases are**, and a stable release is offered before them.
- **Do not replace a jar after publishing.** The index keeps each jar's sha256, and a release whose jar changed is flagged on the mod's page. Publish a new release instead.

### No release yet

A mod on GitHub with no jar on its releases is listed by its source, when that builds on its own: one gradle project with its wrapper, its metadata in `src/main/resources`, no submodules, and nothing in `settings.gradle` reaching outside the repository. Its page says it has no built release, and a player installing it has ender build its default branch on their own machine, with a JDK ender fetches. That works, but it is slow, and it asks every player to run your build scripts, so a release is better for everyone.

## Funding

When players install your mod through ender, the index shows them how to support you: on the mod's page, and in `ender support`, which lists who made an instance's mods and how each takes support. It looks in these places, and any one is enough.

**A FUNDING.yml**, the file GitHub's Sponsor button reads: `.github/FUNDING.yml` in the repository, or on GitHub in a repository named `.github` on your account, which covers every repository you own. Failing those, the FUNDING.yml of another of your own repositories stands for this one too; a fork's is left out, as it keeps the file of the project it was forked from.

```yaml
github: your-name
ko_fi: your-name
patreon: your-name
custom: ['https://example.com/support']
```

**Your readme's links to your own page** on one of the sites below: the handle has to be the repository owner's, or that of a contributor who made at least half its commits, so a thank-you to someone else is not taken for yours.

**The links in your jar**, as Mod Menu shows them: `contact` or `custom.modmenu.links` in `fabric.mod.json`, or their places in `quilt.mod.json`. A link to GitHub Sponsors, Ko-fi, Patreon, Open Collective, Liberapay, Buy Me a Coffee, Polar, thanks.dev, PayPal or Boosty counts, as does any link under a key that says donate or sponsor.

```json
"custom": {
	"modmenu": {
		"links": { "modmenu.donate": "https://ko-fi.com/your-name" }
	}
}
```

**Your Modrinth project's donation links**, when it links this repository as its source: the ones set under Links in the project's settings. A project with none takes those you give on your other Modrinth projects, so one set of links covers every mod of yours there.

A Modrinth project that links the repository by an old name still counts once the crawl has followed GitHub's redirect to the new one.

A FUNDING.yml and a readme are read again weekly, a jar's links with the release, and Modrinth's donation links daily.

**If you contribute to mods on GitHub**, a mod's page lists its contributors, each with their part of its commits and how they take support: the FUNDING.yml in the `.github` repository on your account, your GitHub Sponsors listing, your profile's website when it is a support site such as Ko-fi, or the mod's readme linking your own page there. These are read again weekly too.

## Being found

Once a day the crawl looks for new mods. On GitHub it finds them by the metadata a loader keeps in source, searching a share of GitHub each night, so a new mod can take a few nights to turn up: `fabric.mod.json` or `quilt.mod.json` under `src/main/resources`, `mods.toml` or `neoforge.mods.toml` under `META-INF`. On GitHub, Codeberg and GitLab a topic finds them too: `minecraft-mod`, `fabric-mod`, `fabricmc`, `forge-mod`, `neoforge`, `neoforge-mod` or `quilt-mod`. A Modrinth project that links its source repository leads there as well, and so does a modpack the index lists that downloads a mod's jar from its releases. Once found, a mod is crawled every hour, and one with a release the index has not read goes first, so a new version shows within the hour.

To be listed now rather than when discovery finds it, [open a List a mod issue](https://github.com/fatlard1993/ender-index/issues/new?template=mod.yml) naming the repository: it is crawled and listed within a few minutes, or the issue says why not.

## Your page

Each mod has a page, made from what the repository already holds:

- **The jar's metadata:** its name, description, icon, authors, and the game versions and mods it depends on, which the search filters by.
- **The readme**, rendered as the repository shows it.
- **Pictures:** on GitHub, up to forty images in the repository outside its source, build and texture folders, and not named `icon`, `logo`, `badge` or `banner`. Players can add screenshots of their own.
- **What its code reaches.** Each jar is scanned for what it can do beyond the game, like reaching the network or running programs. That is a finding, not a verdict: an update checker reaches the network. You can [explain a finding](#explaining-a-finding) beside it.

## Explaining a finding

Each jar's findings show on its page: what its code can reach beyond the game, like the network, what it warns of, like a chat webhook, and the hosts its strings name. [What each finding means](https://fatlard1993.github.io/ender-index/findings) says what grants it and what players read into it. You can answer one two ways. Change the mod so the finding goes away, or explain it: [open an Explain a finding issue](https://github.com/fatlard1993/ender-index/issues/new?template=explain.yml) naming the mod, the finding, and what the code does with it. Once the index has looked it over, it shows beside that finding on every jar that has it, labelled as yours and with the release it was written for, because the index has not checked what it says. Say what a player would want to know: why the mod opens a connection, and to where.

An explanation covers the finding as it stood in the release it was approved against: the calls behind it, and for a network or hosts finding, the hosts its code names. When a later jar reaches past that, with a call or a host the explanation never covered, the page says so beside it, until it is looked over again against that jar or rewritten.

The issue has to come from the account that owns the repository, or one that made at least half its commits, and for now only mods on GitHub can be explained this way. Changed words are looked over again before they replace what shows; emptying the explanation takes it down at once. If the finding is wrong, say so on the form: that is how the index learns which checks to refine.

## Opting out

A mod is in the index because its repository publishes it, and its author says otherwise in the same place: no account, and no one to ask.

- **The whole repository:** add the topic `ender-index-opt-out` to it, on GitHub, Codeberg or GitLab. The next crawl to reach it drops its page, its releases and its place in search, and leaves it alone after: usually within an hour or two, or within the week for a mod listed by its source with no release yet. It is looked at again weekly, and listed again once the topic is gone; [open a List a mod issue](https://github.com/fatlard1993/ender-index/issues/new?template=mod.yml) after removing it to be listed straight away. A pack repository with the topic is dropped the same way.
- **One release:** put `ender-index-opt-out` anywhere in its notes, as `<!-- ender-index-opt-out -->` to keep it out of sight. Its jars are not downloaded, and a release read before is dropped from the record, while the rest of the mod stays listed. Notes edited after publishing are read within the week; [open a List a mod issue](https://github.com/fatlard1993/ender-index/issues/new?template=mod.yml) to have them read now. Only the newest thirty releases' notes are read.

Opting out takes a mod out of the index, not off your releases: a player who names your repository, as `ender add gh:owner/repo`, still installs from it.

What the index keeps of a repository that opts out is its name and the day it was last seen opting out, in [`data/opted-out.json`](https://github.com/fatlard1993/ender-index/blob/main/data/opted-out.json), so it knows to leave it alone. The records it kept before stay in the index repository's history, as anything committed to git does.

## Notices

Players can ask for two things on a mod's page: a way to pay its author, when the index knows none, and a built release, when it has only its source. Each player is counted once, and the count shows on the mod's page. The index posts nothing on your repository for it; when enough players have asked, it reaches out to you itself.

To see where your mods stand, run `ender web` signed in to GitHub (`gh auth login`) and open **Your mods** from its search page: each of your mods, what the index cannot do for it, and how many players have asked.

## Questions

Something listed wrong, or a mod missing that should be found? [Open an issue](https://github.com/fatlard1993/ender-index/issues).
