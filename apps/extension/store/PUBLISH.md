# Publishing Global Login to the Chrome Web Store

The text to paste into each field is in [LISTING.md](LISTING.md). Run all commands from the repo root.

## 1. Clean and build

```sh
rm -rf apps/extension/.output release
bun install
bun run extension:store
```

The upload file is `release/global-login-1.0.0.zip`. The command refuses to finish if the manifest still has the dev `key` or localhost hosts.

> `extension:store` replaces `apps/extension/.output/chrome-mv3` with the store build. For local unpacked testing afterwards, run `bun run build:extension` again. That restores the pinned dev ID.

To regenerate the icons, screenshots and promo tiles (optional; needs openssl on PATH):

```sh
bun run extension:store-assets
```

## 2. Put the privacy policy online

```sh
bun run deploy
```

Then check that https://devlogin.peacockindia.in/privacy.html opens. The Store requires this URL to work.

## 3. Upload the package

1. Open the [developer dashboard](https://chrome.google.com/webstore/devconsole) and select the Global Login item. If there isn't one, click **New item**.
2. **Package** tab → **Upload new package** → choose `release/global-login-1.0.0.zip`.

## 4. Store listing tab

| Field | Value |
|---|---|
| Description | the "Description" block in LISTING.md |
| Category | Productivity → Tools |
| Language | English |
| Store icon | `apps/extension/public/icon/128.png` |
| Screenshots | `apps/extension/store/listing/screenshot-1.jpg` … `screenshot-5.jpg`, in that order |
| Small promo tile | `apps/extension/store/listing/promo-small-440x280.jpg` |
| Marquee promo tile | `apps/extension/store/listing/promo-marquee-1400x560.jpg` |
| Homepage URL | `https://devlogin.peacockindia.in` |
| Support URL | `https://devlogin.peacockindia.in`, or your support email |

Click **Save draft**.

## 5. Privacy tab

1. **Single purpose:** paste from LISTING.md.
2. **Permission justification:** paste the matching line for each of storage, identity, tabs, activeTab, scripting, and host permissions.
3. **Are you using remote code?** No.
4. **Data usage:** tick Personally identifiable information, Authentication information and Website content. Then tick all three certification boxes.
5. **Privacy policy URL:** `https://devlogin.peacockindia.in/privacy.html`

Click **Save draft**.

## 6. Distribution tab

- **Visibility:** **Unlisted** (recommended for an internal tool). Use **Private** to limit it to your Google Workspace domain or to testers.
- **Regions:** all regions.

## 7. Test instructions tab

Paste the "Test instructions" block. Replace `<ADD A TEST GOOGLE ACCOUNT HERE>` with a Google account you have approved in the dashboard. Without one, the reviewer can't get past sign-in, and the item is likely to be rejected.

## 8. Submit

Click **Submit for review**. Reviews usually take from a few days to a couple of weeks. You'll get an email with the result.

## 9. After it's approved: allow the Store extension ID

The Store gives the extension a new ID, which is different from the pinned dev ID `mnkjlmlggnfdgdildlgekdnlfomnlfgi`. The backend refuses sign-in from IDs it doesn't know.

1. Copy the item ID from the dashboard. It's the 32-letter ID in the item URL and on the **Package** tab.
2. Add it to `EXTENSION_IDS` in `apps/worker/wrangler.jsonc`, separated by a comma.
3. Run `bun run deploy`.

You can do this as soon as the ID appears after the first upload, without waiting for approval. Reviewers then won't hit the "extension ID is not allowed" error.

## Releasing an update

1. Increase `version` in `apps/extension/wxt.config.ts`. The Store rejects a version it has seen before.
2. Run `bun run extension:store`. This produces `release/global-login-<version>.zip`.
3. In the dashboard, go to **Package** → **Upload new package** → **Submit for review**.
