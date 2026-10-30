The index lists Minecraft mods from the repositories their authors keep, on GitHub, Codeberg and GitLab, and ender installs them from there. There is no account to make and nothing to upload: what your repository already publishes is what players see. These are the pieces that make the most of it.

## Releases

Attach the built jar to a release. A release is where the index and ender take a mod from; a jar in a branch, a CI artifact or a download link in the readme is not read.

- **One release, one or more jars.** Each jar is downloaded and read: what loader and game versions it supports comes from its own `fabric.mod.json`, `quilt.mod.json` or `mods.toml`, not from the release's name.
- **Name the game version** in the tag or the jar's name, like `mymod-1.4.0+1.21.4.jar`. The crawl reads the newest five releases, and past those the newest that names each game version, so a mod released per game version keeps its older builds installable.
- **Publish the mod jar plain.** Jars ending `-sources`, `-javadoc`, `-dev`, `-api`, `-slim` or `-shadow` are skipped as gradle's by-products.
- **Drafts are not read; prereleases are**, and a stable release is offered before them.
- **Do not replace a jar after publishing.** The index keeps each jar's sha256, and a release whose jar changed is flagged on the mod's page. Publish a new release instead.

### No release yet

A mod on GitHub with no jar on its releases is listed by its source, when that builds on its own: one gradle project with its wrapper, its metadata in `src/main/resources`, no submodules, and nothing in `settings.gradle` reaching outside the repository. Its page says it has no built release, and a player installing it has ender build its default branch on their own machine, with a JDK ender fetches. That works, but it is slow, and it asks every player to run your build scripts, so a release is better for everyone.

## Funding

When players install your mod through ender, the index shows them how to support you: on the mod's page, and in `ender support`, which lists who made an instance's mods and how each takes support. It looks in two places, and either is enough.

**A FUNDING.yml**, the file GitHub's Sponsor button reads: `.github/FUNDING.yml` in the repository, or on GitHub in a repository named `.github` on your account, which covers every repository you own.

```yaml
github: your-name
ko_fi: your-name
patreon: your-name
custom: ['https://example.com/support']
```

**The links in your jar**, as Mod Menu shows them: `contact` or `custom.modmenu.links` in `fabric.mod.json`, or their places in `quilt.mod.json`. A link to GitHub Sponsors, Ko-fi, Patreon, Open Collective, Liberapay, Buy Me a Coffee, Polar, thanks.dev, PayPal or Boosty counts, as does any link under a key that says donate or sponsor.

```json
"custom": {
	"modmenu": {
		"links": { "modmenu.donate": "https://ko-fi.com/your-name" }
	}
}
```

A FUNDING.yml is read again weekly; a jar's links are read with the release.

## Being found

Every night the crawl looks for new mods. On GitHub it finds them by the metadata a loader keeps in source, searching a share of GitHub each night, so a new mod can take a few nights to turn up: `fabric.mod.json` or `quilt.mod.json` under `src/main/resources`, `mods.toml` or `neoforge.mods.toml` under `META-INF`. On GitHub, Codeberg and GitLab a topic finds them too: `minecraft-mod`, `fabric-mod`, `fabricmc`, `forge-mod`, `neoforge`, `neoforge-mod` or `quilt-mod`. A Modrinth project that links its source repository leads there as well, and so does a modpack the index lists that downloads a mod's jar from its releases. Once found, a mod's releases are read again by the nightly crawl.

## Your page

Each mod has a page, made from what the repository already holds:

- **The jar's metadata:** its name, description, icon, authors, and the game versions and mods it depends on, which the search filters by.
- **The readme**, rendered as the repository shows it.
- **Pictures:** images in the repository outside `src` and `build` and not named `icon`, `logo`, `badge` or `banner`. Players can add screenshots of their own.
- **What its code reaches.** Each jar is scanned for what it can do beyond the game, like reaching the network or running programs. That is a finding, not a verdict: an update checker reaches the network.

## Notices

Players can ask for two things on a mod's page: a way to pay its author, when the index knows none, and a built release, when it has only its source. Each player is counted once. When three have asked, the index opens one issue on the repository saying so, with a link here. It does that once per repository for each, and closing the issue is the whole answer it needs.

To see where your mods stand before then, run `ender web` signed in to GitHub (`gh auth login`) and open **Your mods** from its search page: each of your mods, what the index cannot do for it, and how many players have asked.

## Questions

Something listed wrong, or a mod missing that should be found? [Open an issue](https://github.com/fatlard1993/ender-index/issues).
