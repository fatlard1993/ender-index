The index lists Minecraft mods from the repositories their authors keep, on GitHub, Codeberg and GitLab, and ender installs them from there. There is no account to make and nothing to upload: what your repository already publishes is what players see. These are the pieces that make the most of it.

## Releases

Attach the built jar to a release. A release is where the index and ender take a mod from; a jar in a branch, a CI artifact or a download link in the readme is not read.

- **One release, one or more jars.** Each jar is downloaded and read: what loader and game versions it supports comes from its own `fabric.mod.json`, `quilt.mod.json` or `mods.toml`, not from the release's name.
- **Name the game version** in the tag or the jar's name, like `mymod-1.4.0+1.21.4.jar`. The crawl reads the newest five releases, and past those the newest that names each game version, so a mod released per game version keeps its older builds installable.
- **Publish the mod jar plain.** Jars ending `-sources`, `-javadoc`, `-dev`, `-api`, `-slim` or `-shadow` are skipped as gradle's by-products.
- **Drafts are not read; prereleases are**, and a stable release is offered before them.
- **Do not replace a jar after publishing.** The index keeps each jar's sha256, and a release whose jar changed is flagged on the mod's page. Publish a new release instead.

A mod with no jar on its releases is not listed. A pack that names it takes the jar from Modrinth when there is one there, and the pack's page says so.

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

Every Sunday the crawl looks for new mods. On GitHub it finds them by the metadata a loader keeps in source: `fabric.mod.json` or `quilt.mod.json` under `src/main/resources`, `mods.toml` or `neoforge.mods.toml` under `META-INF`. On GitHub, Codeberg and GitLab a topic finds them too: `minecraft-mod`, `fabric-mod`, `fabricmc`, `forge-mod`, `neoforge`, `neoforge-mod` or `quilt-mod`. A Modrinth project that links its source repository leads there as well. Once found, a mod's releases are read again by the nightly crawl.

## Your page

Each mod has a page, made from what the repository already holds:

- **The jar's metadata:** its name, description, icon, authors, and the game versions and mods it depends on, which the search filters by.
- **The readme**, rendered as the repository shows it.
- **Pictures:** images in the repository outside `src` and `build` and not named `icon`, `logo`, `badge` or `banner`. Players can add screenshots of their own.
- **What its code reaches.** Each jar is scanned for what it can do beyond the game, like reaching the network or running programs. That is a finding, not a verdict: an update checker reaches the network.

## Questions

Something listed wrong, or a mod missing that should be found? [Open an issue](https://github.com/fatlard1993/ender-index/issues).
