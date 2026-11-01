// Captures the real extension UI against the in-memory test backend, seeded with
// demo data, then composes Chrome Web Store screenshots and promo tiles into
// apps/extension/store/. Run after `bun run build:web && bun run build:extension`.
import { chromium } from "@playwright/test"
import { execFileSync, spawn } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:https"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const backend = "http://localhost:8799"
// Chromium maps this host to the local demo server so screenshots show a
// realistic address instead of localhost.
const demoSite = "https://staging.acme-shop.dev"
const out = resolve("apps/extension/store")
const raw = resolve(out, "raw")
mkdirSync(raw, { recursive: true })
setTimeout(() => {
  console.error("Timed out")
  process.exit(1)
}, 180_000).unref()

const server = spawn("bun", ["tests/server.ts"], { stdio: "inherit" })
process.on("exit", () => server.kill())
for (let i = 0; ; i++) {
  try {
    if ((await fetch("http://localhost:8798/health")).ok) break
  } catch {}
  if (i > 100) throw new Error("Test server did not start")
  await new Promise((r) => setTimeout(r, 200))
}

// A realistic login page for the in-page screenshots, served over HTTPS with a
// throwaway self-signed certificate (requires openssl on PATH).
const loginPage = readFileSync(resolve(out, "demo-login.html"), "utf8")
const certs = mkdtempSync(resolve(tmpdir(), "globallogin-cert-"))
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
  "-subj", "/CN=staging.acme-shop.dev",
  "-keyout", resolve(certs, "key.pem"), "-out", resolve(certs, "cert.pem"),
], { stdio: "ignore" })
const tls = {
  key: readFileSync(resolve(certs, "key.pem")),
  cert: readFileSync(resolve(certs, "cert.pem")),
}
const site = createServer(tls, (_, res) => {
  res.writeHead(200, { "Content-Type": "text/html" })
  res.end(loginPage)
}).listen(8797)

const { token } = await (await fetch(`${backend}/fixture/token`)).json()
async function api(path, method = "GET", body) {
  const response = await fetch(`${backend}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body && JSON.stringify(body),
  })
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  return response.json()
}

await api("/projects/fixture-project", "DELETE")
const demo = [
  {
    name: "Acme Commerce",
    icon: "🛒",
    description: "Storefront and admin console",
    urls: [demoSite, "https://acme-shop.com"],
    accounts: [
      ["Store admin", "admin@acme-shop.com", "🛡️", true],
      ["QA tester", "qa.tester@acme-shop.com", "🧪"],
      ["Customer demo", "demo.customer@acme-shop.com", "👤"],
      ["Support desk", "support@acme-shop.com", "🎧"],
    ],
  },
  {
    name: "Orbit CRM",
    icon: "🪐",
    description: "Sales pipeline",
    urls: ["https://qa.orbitcrm.io", "https://app.orbitcrm.io"],
    accounts: [
      ["Sales manager", "maya@orbitcrm.io", "📊", true],
      ["Support agent", "agent@orbitcrm.io", "💬", false, "google"],
    ],
  },
  {
    name: "Pulse Analytics",
    icon: "📈",
    description: "Product analytics",
    urls: ["https://dev.pulse-analytics.app"],
    accounts: [
      ["Workspace owner", "owner@pulse-analytics.app", "👑", true],
      ["Read-only viewer", "viewer@pulse-analytics.app", "👀"],
    ],
  },
  {
    name: "Nimbus Payments",
    icon: "💳",
    description: "Billing sandbox",
    urls: ["https://sandbox.nimbuspay.io"],
    accounts: [["Finance ops", "finance@nimbuspay.io", "💼", true]],
  },
  {
    name: "Harbor HR",
    icon: "⚓",
    description: "People platform",
    urls: ["https://uat.harborhr.com"],
    accounts: [["HR admin", "hr.admin@harborhr.com", "🗂️", true]],
  },
]
let acme
for (const project of demo) {
  const created = await api("/projects", "POST", {
    name: project.name,
    icon: project.icon,
    description: project.description,
    urls: project.urls,
    login_path: "/login",
  })
  if (project.name === "Acme Commerce") acme = created
  for (const [label, email, icon, isDefault, type] of project.accounts)
    await api("/accounts", "POST", {
      project_id: created.id,
      label,
      email,
      icon,
      login_type: type ?? "password",
      password: type === "google" ? undefined : "Demo-Passw0rd!",
      is_default: Boolean(isDefault),
      websites: project.urls.map((url) => ({ url })),
    })
}
for (const [title, icon, content] of [
  ["Staging VPN", "🔐", "Server: vpn.acme-shop.dev\nUser: team\nShared key: ••••••••"],
  ["Release checklist", "✅", "1. Freeze main\n2. Run smoke tests\n3. Tag release"],
  ["Stripe test cards", "💳", "4242 4242 4242 4242 — success\n4000 0000 0000 9995 — declined"],
])
  await api("/notes", "POST", { project_id: acme.id, title, icon, content })

// Copy the build and grant the demo host, as a user would when enabling the site.
const extension = mkdtempSync(resolve(tmpdir(), "globallogin-ext-"))
cpSync(resolve("apps/extension/.output/chrome-mv3"), extension, { recursive: true })
const manifest = JSON.parse(readFileSync(resolve(extension, "manifest.json"), "utf8"))
manifest.host_permissions.push(`${demoSite}/*`)
writeFileSync(resolve(extension, "manifest.json"), JSON.stringify(manifest))
const context = await chromium.launchPersistentContext(
  mkdtempSync(resolve(tmpdir(), "globallogin-store-")),
  {
    channel: "chromium",
    headless: true,
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--host-resolver-rules=MAP staging.acme-shop.dev 127.0.0.1:8797",
      "--ignore-certificate-errors",
    ],
  }
)
context.setDefaultTimeout(15_000)
const worker =
  context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
const extensionId = worker.url().split("/")[2]

for (const theme of ["light", "dark"]) {
  await worker.evaluate(
    async ({ token, backend, theme }) => {
      await chrome.storage.local.set({
        token,
        origin: backend,
        excluded: [],
        uiSettings: { theme, submitAfterFill: false },
      })
    },
    { token, backend, theme }
  )
  // The popup reads the active tab, so open the demo site first.
  const tab = await context.newPage()
  await tab.setViewportSize({ width: 1280, height: 800 })
  await tab.goto(`${demoSite}/login`)
  const popup = await context.newPage()
  await popup.setViewportSize({ width: 740, height: 560 })
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.waitForTimeout(2500)
  await popup.screenshot({ path: resolve(raw, `popup-${theme}.png`) })
  await popup.close()

  await tab.bringToFront()
  await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url: `${url}/*` })
    await chrome.tabs.update(tab.id, { active: true })
    await globalThis.openQuickAccess(tab)
  }, demoSite)
  await tab.waitForTimeout(2500)
  await tab.screenshot({ path: resolve(raw, `quick-${theme}.png`) })
  await tab.keyboard.type("acme")
  await tab.waitForTimeout(1200)
  await tab.screenshot({ path: resolve(raw, `quick-search-${theme}.png`) })
  await tab.close()
}

await context.addCookies([
  { name: "devlogin_session", value: token, url: backend },
])
const web = await context.newPage()
await web.setViewportSize({ width: 1280, height: 800 })
await web.goto(backend)
await web.waitForTimeout(2500)
await web.screenshot({ path: resolve(raw, "web.png") })
await web.getByText("Acme Commerce").first().click()
await web.waitForTimeout(1500)
await web.getByText("Store admin").first().click()
await web.waitForTimeout(1500)
await web.screenshot({ path: resolve(raw, "web-project.png") })

await context.close()
site.close()
server.kill()
console.log(`Raw screenshots in ${raw}`)
process.exit(0)
