# Install or update Global Login

## New installation

1. Install Bun and run `bun install --frozen-lockfile`. Sign in to Wrangler in your Cloudflare account.
2. Create a D1 database and a **private** R2 bucket. In `apps/worker/wrangler.jsonc`, replace the account ID, database name/ID, bucket name, routes, zone and APP_ORIGIN with your own. Keep binding names DB, FILES and ASSETS. Choose your canonical HTTPS origin. Remove the Peacock alias route in your fork. For a second hostname, configure a redirect to your canonical origin so both addresses use the same session and OAuth callback.
3. Register your canonical `/api/auth/callback` in Google OAuth. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and a fresh 32-byte base64 CREDENTIAL_KEY as Worker secrets. Keep the key in your secret manager. Configure your extension's backend in Settings, or build with VITE_API_ORIGIN set. Allowlist your actual Chrome extension ID in EXTENSION_IDS.
4. If you named your database differently, update the database name in the worker's db:remote script or run Wrangler's D1 migrations command with your database name. Build the website, apply migrations to the new database, then deploy the Worker and its static assets. The extension is built separately with `bun run extension:zip`.
5. Complete browser sign-in and verify approval, vault access, and a file round trip with a disposable record.

## Upgrade an existing installation

1. Record the current release, Worker version, D1 ID, R2 bucket, APP_ORIGIN, allowlisted extension IDs and encryption-key secret reference. Keep your own deployment configuration when bringing in the release.
2. Take a D1 backup or record a D1 Time Travel bookmark. Keep an independent backup of R2 objects and your existing encryption key. The dashboard JSON export covers shared logins and projects. It is not a complete system backup.
3. Inspect the new SQL files in `apps/worker/migrations`. Rehearse against a copy of your database. Version 1.1.0 adds tables and columns. It keeps existing IDs, login ciphertext and timestamps.
4. Install the release dependencies, run the build and apply outstanding D1 migrations **once to the same database**. Deploy the Worker with the same secrets, DB and bucket bindings. Normal upgrades do not run secrets:init, rotate keys, reset the database, or import over production.
5. Check sign-in, a known login, personal items, file download and MCP authorization. Distribute the matching extension ZIP. Open **What’s new** in the extension to view the connected website's release page.
6. If there is an application regression, redeploy the previous compatible Worker/assets first. Retain the additive schema. Restoring D1 or R2 from an older backup can discard later writes; reconcile those writes before any restore.
