# ender-shots

Takes players' screenshots and their stories from the index's share page, with no account, and files each into a private repository to be looked over. Nothing sent is public until it is.

## Review

Each shot is an issue in the queue repository, with its picture on a branch of its own.

- **Show it:** label the issue `shown`. Within the hour the `shots` workflow copies the picture into `data/shots`, lists it in `data/shots.json` for the mods it shows, closes the issue and deletes the branch.
- **Turn it down:** close the issue. The workflow deletes its branch.
- **Edit it:** change the JSON record at the end of the issue. That record, not the text above it, is what is published.
- **Take it down later:** remove the `shown` label. The next run unpublishes it.

## Setup

1. A private repository for the queue (`fatlard1993/ender-shots`), with a first commit on `main`, and a `shown` label.
2. A fine-grained token for that repository alone, with Contents and Issues read and write. It is the Worker's `GITHUB_TOKEN` and the index's `SHOTS_TOKEN` secret.
3. A Turnstile widget in Cloudflare for `fatlard1993.github.io` (and `localhost`). Its site key goes in `client/shots.js`, its secret is the Worker's `TURNSTILE_SECRET`.
4. Deploy:

   ```sh
   cd worker
   bunx wrangler login
   bunx wrangler secret put GITHUB_TOKEN
   bunx wrangler secret put TURNSTILE_SECRET
   bunx wrangler deploy
   ```

   The address it prints goes in `client/shots.js` as `SHOTS_WORKER`.
