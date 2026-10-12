# DevLogin

A single shared internal workspace: Google sign-in, manual user approval, web project/account management, and a Chrome extension for managing and using project credentials. Bun workspaces, Vite/React, WXT, Hono, D1, and Drizzle. No organizations or billing.

Initialized with the required command:

```sh
bunx --bun shadcn@latest init --preset b1au7YYAi --template vite --monorepo
```

The generated `base-rhea` preset, Inter typography, theme, Vite/Tailwind configuration, UI package, and monorepo are retained. The generator's project contents were placed in this repository root. Both applications import `packages/ui`.

## Current deployment

Dashboard and API: https://devlogin.peacockindia.in

The Worker and D1 migrations are deployed to the Peacock Cloudflare account `86145dad61413f9a7800ad8c5d481b81`, which owns `peacockindia.in`. D1 database: `devlogin`, ID `ebecaf42-9ad3-47e4-b4bf-da3a6082c454`. The custom domain is configured in `apps/worker/wrangler.jsonc`. The credential encryption key is installed as a Worker secret, with its local copy in the ignored `apps/worker/.dev.vars` file.

Google OAuth credentials are configured locally in the ignored `apps/worker/.dev.vars` file and deployed as Worker secrets. The production callback is `https://devlogin.peacockindia.in/api/auth/callback`. Completing a real Google sign-in and approving the first administrator require the user's account. For local OAuth, also register `http://localhost:8787/api/auth/callback` in Google Cloud; the supplied client currently has only the production callback registered.

## Setup

### Secrets and Git

Commit source code, this README, `.env.example`, and `apps/worker/.dev.vars.example`. The example files contain placeholders only.

Keep actual Google OAuth credentials and `CREDENTIAL_KEY` in the local, Git-ignored `apps/worker/.dev.vars`. Extension overrides belong in an ignored `apps/extension/.env`. Never commit real environment files, encryption keys, tokens, or database exports. Production secrets are stored in Cloudflare Workers using `bun run secrets:upload`; normal code deployment preserves them.

For a fresh checkout, copy `apps/worker/.dev.vars.example` to `apps/worker/.dev.vars`, remove its placeholder `CREDENTIAL_KEY` line, then run `bun run secrets:init` to generate a key. Fill in your Google OAuth values locally. For an existing installation, preserve its current encryption key so saved credentials remain readable.

Before pushing, verify that `git check-ignore apps/worker/.dev.vars` succeeds and that only example environment files appear in `git diff --cached --name-only`.

Requires Bun 1.3.14+, Node.js 20.19+ for build/test tooling, and a Cloudflare account with Workers and D1 access.

```sh
bun install
bun run secrets:init
```

`secrets:init` creates a random 32-byte AES key in `apps/worker/.dev.vars` and preserves an existing key. Keep a secure backup. Changing it makes existing encrypted passwords unreadable; key rotation requires decrypting and re-encrypting the credentials first.

For a new Cloudflare account or database:

```sh
bunx wrangler login
cd apps/worker
bunx wrangler d1 create devlogin
```

Update `account_id`, the D1 `database_id`, and `vars.APP_ORIGIN` in `apps/worker/wrangler.jsonc` with your account, database, and deployed origin. This checkout already has the created database configured. Worker static assets serve `apps/web/dist`; `/api/*` always runs through Hono.

### Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Create/select a project. Configure Google Auth Platform branding, audience, and contact email.
2. For personal testing, choose External / Testing and add your Google email as a test user. An Internal audience requires an eligible Google Workspace organization.
3. Create an OAuth client of type **Web application**.
4. Add this exact authorized redirect URI: `https://devlogin.peacockindia.in/api/auth/callback`.
5. For local testing, also add `http://localhost:8787/api/auth/callback`.
6. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the ignored `apps/worker/.dev.vars` file. Use `apps/worker/.dev.vars.example` as a reference; preserve the existing `CREDENTIAL_KEY`.
7. Upload only the three secret values (the script does not upload local origins):

```sh
bun run secrets:upload
bun run deploy
```

The extension reuses this web OAuth client through `chrome.identity.launchWebAuthFlow`. Google returns to the Worker callback. The Worker redirects a short-lived authorization code to Chrome's supported `chromiumapp.org` callback; the extension exchanges it using PKCE. You do not need a separate Google Chrome-extension client.

### Approve the first administrator

Sign in once on the deployed dashboard. You should see **Waiting for Approval**. Then run, replacing the email with the email used to sign in:

```sh
cd apps/worker
bunx wrangler d1 execute devlogin --remote --command "UPDATE users SET approved = 1, is_admin = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email = 'YOUR_GOOGLE_EMAIL';"
```

Use `--local` for the local D1 database. Click **Check approval**; a new login is not necessary. Use the dashboard's **Users** tab to approve, reject, or disable other accounts. Reject/disable both set `approved = false`. Sessions check approval on every request. The API prevents an administrator from disabling their own account.

### Install the Chrome extension

```sh
bun run build:extension
```

1. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select `apps/extension/.output/chrome-mv3`.
3. This checkout's unpacked extension ID, `dlhhhalmplphflkcolobockpofadfeaa`, is already allowed in the production config. Compare it with the displayed ID. If it differs, add the displayed ID to `vars.EXTENSION_IDS` in `apps/worker/wrangler.jsonc`. Multiple IDs are comma separated. For local use, also set `EXTENSION_IDS` in `.dev.vars`.
4. Run `bun run deploy` if you change the production allowlist.
5. Open the popup. Its default backend is the deployment above; change it in **Settings** if needed. Click **Continue with Google**. Reopen the popup after authentication finishes.

Changing the backend signs the extension out. Approval applies equally to extension sessions. An unpacked extension's ID can change when its installation path changes; update the allowlist if that happens.

## Local development

In `apps/worker/.dev.vars`, set `APP_ORIGIN=http://localhost:8787` and `DEV_ORIGIN=http://localhost:5173`, as well as the Google secrets, encryption key, and local extension ID. `.dev.vars` is ignored by Git.

```sh
bun run build:web
bun run db:local
bun run dev
```

The Vite dashboard runs at `http://localhost:5173` and proxies API requests to the Worker on port 8787. OAuth uses the registered Worker callback and returns to `http://localhost:8787`, which also serves the built dashboard. Use the Vite URL for UI development. Local D1 data is separate from production data.

Run extension development in a second terminal:

```sh
bun run dev:extension
```

Select `http://localhost:8787` as the backend in the extension's Settings. `.env.example` documents the optional `VITE_API_ORIGIN` build override; copy it to `apps/extension/.env` when needed.

## Using DevLogin

- Administrators add, edit, and delete projects/accounts in either the web dashboard or extension. Approved members can view and use credentials and manage their own auto-login preferences. Web forms live in shadcn dialogs; projects filter the login list in the three-panel workspace.
- Add websites to each login. HTTPS is required except on localhost. Scheme, host, and port match exactly; staging domains must be listed explicitly. URL path prefixes are supported, with the most specific prefix taking precedence. Optional login paths and custom selectors are configured per website in Advanced settings.
- In Home, search saved accounts and click a row for password/copy actions, **Fill login**, and **Fill and submit**. Focus a login field to open the compact account dropdown. Hover or use ArrowDown/ArrowUp to select a row, then click or press Enter to fill both fields. Enter on the input selects the first account. **Settings → Submit after autofill** defaults ON; turn it OFF for fill-only behavior. Required fields and CAPTCHA remain subject to the website’s normal validation. **Settings → Appearance** offers Light, Dark, and System for both the popup and in-page UI. Subtle account icon colors indicate administrator/owner (amber), testing/QA (violet), default (green), and other accounts (blue). The bottom-right settings icon opens account management. Suggestions close on Escape or outside click. Auto-login defaults OFF; enabling it submits the selected/default account only at the registered login path. Automatic login leaves already populated fields alone.
- For localhost, `127.0.0.1`, or IPv6 loopback, choose the currently running project in **Home → Local project identity → Identify this local project**. This stores the exact origin and public page identity locally. URL/path matching still applies. A declared `application-name` or `og:site_name` is preferred over a route-dependent title; otherwise the page title is used. No match or multiple matches pauses manual, inline, and automatic filling. Re-identify a project if its identity changes. Give apps that reuse a port distinct stable `<meta name="application-name" content="My project">` values: identical metadata cannot distinguish two apps. No backend/database changes or form values are involved.

- Missing selectors can be configured in **Edit Login → website Advanced settings**. Email/password must be visible, enabled inputs. React controlled inputs receive native value changes plus bubbling input/change events.
- Google accounts initiate the application's sign-in button. They do not select a Google identity or bypass Google's checks.
- Automatic attempts run once per page URL, no more than once per minute per tab/project, and pause after three attempts in ten minutes. Manual submissions have a five-second guard. Deleting a selected account disables its auto-login preference.
- Popup opening, navigation, mutation, and Refresh sync metadata from D1. Content scripts use a 30-second metadata freshness window; password retrieval and automatic submission re-check authenticated access. Passwords are fetched when needed and never cached in extension storage. Revealed passwords hide after 30 seconds.
- Native/common HTML and React forms are supported. Multi-step identity forms, CAPTCHA, closed shadow roots, and cross-origin iframe forms require manual interaction; DevLogin does not bypass them.

### Enable a website and save a login

1. Visit a project website and click **Enable DevLogin on this site** in the popup. Chrome asks for site permission. New HTTPS websites require this explicit grant; the backend and localhost hosts are included for API/local development. Chrome permissions cover the host, while project/account matching still checks the exact scheme and port.
2. Optionally enable **browser-wide monitoring** in Settings for discovery on other sites. Disable it there anytime. **Exclude this website** disables autofill and capture on that exact origin, including when browser-wide monitoring is on. Google authentication domains and the DevLogin backend are always excluded from capture.
3. Submit a normal login, signup, change-password, or reset-password form. Administrators receive **Save login to DevLogin?** or **Update password in DevLogin?** if the submitted password differs from the saved credential. Regular users can fill shared accounts but cannot create or update them.
4. Review the website, project, account and masked password. Choose a label, or choose which matching account to update. Choose an existing project or create a new one for an unknown enabled website. Click **Save login** / **Update saved**, or **Not now**.
5. The shared record syncs immediately. Popup open/Refresh and a 30-second metadata check pick up changes from other clients. The web dashboard refreshes on focus and every 30 seconds while visible.

A form submission is not proof of successful login; the prompt explicitly says authentication success has not been verified. Candidates are kept only in service-worker memory for two minutes, survive same-origin page navigation, and are discarded on expiry, dismissal, tab close, browser restart, or service-worker restart. If a prompt expires, submit again. Plaintext passwords are never written to local/session extension storage. Page-generated synthetic clicks cannot confirm saving or request autofill. Normal Google sign-in buttons remain supported, but Google passwords are never captured.

Projects are folders: create them with only a name, an icon, and an optional description. Each login owns its title, username, encrypted password, notes, icon, and up to 100 website entries. Add or remove websites and move a login between folders in the same dialog. Website entries match exact scheme, host, and port; a configured path matches that path and its descendants at a slash boundary. Query strings and fragments are removed on save. Optional login paths and selectors are under each website's Advanced settings.

The additive `0002_perfect_blindfold.sql` migration copies legacy project URLs, login paths, and selectors to each existing login, respecting environment restrictions. IDs, timestamps, encrypted passwords, and legacy columns are retained. Website metadata is stored as JSON on the existing account record, matching the existing project-URL storage approach. Moving a login clears preferences pointing to it in its former project and disables that automatic login. A password update changes one shared credential for all its configured websites.

The web workspace keeps the three-panel layout and supports light/dark themes. Emoji or Lucide icons can be chosen without another UI library; logins otherwise try the first website's favicon and fall back to a key icon. Reload the rebuilt unpacked extension after updating; its popup layout is retained, and its matching now uses login websites. For localhost, the existing explicit project identity check still applies.

Administrators can drag a login from the middle list onto another project in the sidebar. The target highlights during dragging; after saving, project counts update and the moved login remains selected in its destination. Its password, websites, notes, and icon are preserved. The project selector in Edit Login remains available for keyboard and touch use.

Click the icon preview or Change Icon for quick choices, then **More emojis** to browse the full bundled catalog with search, categories, and additional results. You can also paste a single emoji, including skin-tone or joined emoji, into the search box and click Use. The shared picker works in the web app and extension; its catalog loads on demand without contacting an emoji service. Data comes from [Unicode's emoji catalog](https://unicode.org/Public/emoji/latest/emoji-test.txt) under the [Unicode data license](packages/ui/src/lib/UNICODE-LICENSE.txt). To update it, run `bun scripts/generate-emoji-data.ts`; the generated data and license are committed to Git.

New logins default to the first website's favicon in the web editor, extension popup, and in-page autofill suggestions. Selecting an emoji or Lucide icon overrides it; **Use website favicon** clears that override and persists when saved. The preview updates while editing websites. Icons try the site's `/favicon.ico`, then Google's favicon service for public hostnames (hostname only); localhost and private addresses use only their own site. Unavailable icons fall back to a key.

## Verification

```sh
bun run typecheck
bun run lint
bun run test
bunx playwright install chromium
bun run test:browser
bun run build
bun run test:deployment
```

API tests use a real in-memory SQLite database with every generated migration, and stub Google responses only inside tests. They cover registration/approval, OAuth state/PKCE, session expiry/revocation, member/admin permissions, encryption, default accounts, deletion sync, preferences, and URL matching. Browser tests load the actual built MV3 extension in Chromium and use isolated fixture servers with the real Hono API. They verify React forms, manual/automatic login, populated-field protection, cooldowns, custom selectors, in-page suggestions, save confirmation, update-in-place, mismatched new/confirm passwords, signup/reset forms, multiple account selection, unknown-site project creation, navigation retention, exclusions, environment isolation, browser restart, web/extension CRUD and sync, Google project buttons, and approval screens. Fixtures are outside the application bundles and never deployed.

Verified on 2026-10-12: 19 API/unit/migration tests and 36 Chromium extension/web scenarios passed, along with type checking, lint and web/extension/Worker builds. The navigation save-confirmation regression also passed three consecutive focused checks. Production smoke testing loads the built extension, checks its Cloudflare API connection and allowed OAuth redirect, verifies anonymous access is denied, and reaches Google's real sign-in page. Completing interactive Google account selection is a manual check using your account. The production folder/login migration preserved the existing project, user, and encrypted credential; its website association was backfilled successfully. Production smoke checks passed after deployment.

Ready-to-load Chrome folder: `apps/extension/.output/chrome-mv3`. Packaged archive: `apps/extension/.output/extension-1.0.0-chrome.zip`. Reload the unpacked extension in `chrome://extensions` after updating this folder; enable the desired websites in the popup.

`bun run build` builds the dashboard and extension and performs a Wrangler deployment dry-run. `bun run deploy` builds the dashboard, applies production migrations, and deploys the Worker plus static assets. `bun run extension:zip` creates the installable extension archive.

Relevant docs: [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Chrome launchWebAuthFlow](https://developer.chrome.com/docs/extensions/reference/api/identity#method-launchWebAuthFlow), [Workers static-asset routing](https://developers.cloudflare.com/workers/static-assets/routing/advanced/).
