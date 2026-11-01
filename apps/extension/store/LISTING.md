# Chrome Web Store listing — Global Login

Rebuild everything with `bun run extension:store-assets`. That needs openssl on PATH. Build the upload zip with `bun run extension:store`; it writes `apps/extension/.output/extension-1.0.0-chrome.zip`.

## Package

- **Upload:** `apps/extension/.output/extension-<version>-chrome.zip`. This is a store build: it has no `key` and no localhost hosts.
- **Before the first release:** the store assigns a new extension ID. Add it to `EXTENSION_IDS` in `apps/worker/wrangler.jsonc` and deploy, or Google sign-in will be refused. You can also pin the store ID: copy the public key from Dashboard → Package → "View public key" into the `key` in `wxt.config.ts` for unpacked builds.

## Store listing

**Name:** Global Login (from manifest)

**Summary (132 max):** Your team's shared logins and secure notes, filled in one click on every staging, QA and production site.

**Category:** Productivity → Tools (Workflow & Planning is also acceptable)

**Language:** English

**Description:**

```
Global Login keeps your team's shared website logins and secure notes in one place, and signs you in with one click. It covers the staging, QA, UAT and production environments of every project you work on.

Built for development, QA and support teams who share test accounts across many environments.

★ ONE SHORTCUT, ANY SITE
Press Ctrl+Shift+Space (⌘+Shift+Space on Mac) on any page to open Quick Access. Search every login and note, then press Enter to fill the form. Ctrl+C copies the password, and Ctrl+Shift+C copies the username.

★ OPEN & FILL
Pick an account in the popup. Global Login opens the right login page and fills the username and password for you. For Google-based accounts it presses "Continue with Google" for you. Optional auto-login signs you in as soon as the page loads.

★ THE RIGHT ACCOUNT FOR EVERY ENVIRONMENT
Group logins by project and attach as many website URLs as you need. Each project can cover staging, QA, UAT and production. Global Login suggests matching accounts for the site you are on.

★ SECURE NOTES
Keep VPN details, test card numbers, API endpoints and release checklists next to the logins they belong to. Notes are encrypted and searchable from Quick Access.

★ SAVE AS YOU GO
When you sign in, sign up or change a password on a project site, Global Login offers to save or update that credential for the whole team.

★ BUILT FOR TEAMS
• Sign in with Google. Every new member must be approved by an administrator.
• Admins manage projects, logins and notes from the web dashboard.
• Changes sync to every teammate instantly.
• Passwords and notes are encrypted with AES-256-GCM on the server.
• Light and dark themes, and keyboard-first everywhere.

PRIVACY
Global Login only reads login forms on your team's project sites, or on sites you enable. It never reads Google sign-in pages, never tracks browsing, and never sells or shares data. Privacy policy: https://devlogin.peacockindia.in/privacy.html

Global Login requires a workspace account. Ask your team administrator for access.
```

**Graphics** (in `store/listing/`):

| Field | File |
|---|---|
| Store icon (128×128) | `apps/extension/public/icon/128.png` |
| Screenshots (1280×800) | `screenshot-1.jpg` … `screenshot-5.jpg` |
| Small promo tile (440×280) | `promo-small-440x280.jpg` |
| Marquee promo tile (1400×560) | `promo-marquee-1400x560.jpg` |

**Official URL:** none (needs a Search Console–verified domain)
**Homepage URL:** https://devlogin.peacockindia.in
**Support URL:** mailto:kasi@b12healthcare.in (or the homepage)

## Privacy practices

**Single purpose:**
Global Login lets members of a team securely store, find and fill their shared website login credentials and secure notes.

**Permission justifications:**

- **storage:** Saves the user's session token, interface settings (theme, auto-submit), and the list of sites the user has excluded from autofill.
- **identity:** Uses chrome.identity.launchWebAuthFlow to sign the user in with Google through the Global Login backend (OAuth with PKCE).
- **tabs:** Reads the active tab's URL to suggest the matching project logins. Also opens a project's login page in a new tab when the user clicks "Open & Fill".
- **activeTab:** When the user presses the Quick Access shortcut or opens the popup, the extension gets temporary access to the current page so it can show the Quick Access panel and fill the chosen login.
- **scripting:** Injects the Quick Access panel and the form-filling script into the current tab. Also registers the login-form detector on sites that belong to the user's projects.
- **Host permission (devlogin.peacockindia.in):** This is the Global Login backend API, which syncs the team's projects, logins and notes.
- **Optional host permissions (http://*/*, https://*/*):** Requested at runtime only when the user enables autofill or auto-login on a project's website. They are needed because each team's project sites are arbitrary domains (staging, QA and production hosts) that cannot be known in advance.
- **Remote code:** No. All JavaScript is packaged in the extension.

**Data usage — check these:**

- Personally identifiable information (name and email from Google sign-in)
- Authentication information (the website usernames and passwords the team saves)
- Website content (login form fields on the user's project sites only)

**Certifications — tick all three:**

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://devlogin.peacockindia.in/privacy.html. It goes live with the next `bun run deploy`.

## Distribution

- **Visibility:** **Unlisted** is recommended for an internal team tool. Anyone with the link can install it, but it does not appear in search. Use **Private** to limit installs to a Google Workspace domain or trusted testers. Use **Public** only if outside teams should find it.
- **Regions:** all.

## Test instructions (for the reviewer)

```
Global Login is a team tool. Sign-in uses Google, and an administrator must approve each new account. To review it:
1. Install the extension and click its toolbar icon, then "Sign in with Google".
2. Send us the Google account you used (reply to this submission or email kasi@b12healthcare.in) and we will approve it immediately. Alternatively, sign in with this pre-approved reviewer account: <ADD A TEST GOOGLE ACCOUNT HERE>.
3. Open any login in the popup and click "Open & Fill". Or press Ctrl+Shift+Space on any website to open Quick Access.
```
