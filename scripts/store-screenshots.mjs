// Run against the disposable in-memory browser fixture after building the extension.
import { chromium } from "@playwright/test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
const backend = "http://localhost:8799"
const { token } = await (await fetch(backend + "/fixture/token")).json()
async function api(path, method, body) {
  const res = await fetch(backend + "/api/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body && JSON.stringify(body),
  })
  if (!res.ok) throw new Error("Demo fixture " + res.status)
  return res.json()
}
for (const p of await api("projects", "GET"))
  await api("projects/" + p.id, "DELETE")
const project = await api("projects", "POST", { name: "Studio", icon: "🎨" })
for (const [label, icon] of [
  ["Design Library", "🎨"],
  ["Developer Portal", "💻"],
  ["Release Console", "🚀"],
  ["Team Workspace", "📁"],
])
  await api("accounts", "POST", {
    project_id: project.id,
    label,
    icon,
    email: "••••••••",
    password: crypto.randomUUID(),
    login_type: "password",
    websites: [{ url: "https://studio.example" }],
    tags: ["Studio"],
  })
const out = resolve("apps/web/public/store"),
  profile = await mkdtemp(resolve(tmpdir(), "global-login-store-"))
await mkdir(out, { recursive: true })
const ext = resolve("apps/extension/.output/chrome-mv3")
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext],
  viewport: { width: 1280, height: 800 },
})
try {
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
  const root = worker.url().slice(0, worker.url().lastIndexOf("/"))
  await worker.evaluate(
    async ({ token, backend }) => {
      await chrome.storage.local.set({
        origin: backend,
        token,
        uiSettings: { theme: "dark", submitAfterFill: false },
      })
    },
    { token, backend }
  )
  const ui = await context.newPage()
  await ui.goto(root + "/welcome.html")
  await ui.getByRole("heading", { name: "Welcome to Global Login" }).waitFor()
  await ui.evaluate(() => document.fonts.ready)
  await ui.screenshot({ path: out + "/welcome.png" })
  await ui.setViewportSize({ width: 620, height: 495 })
  await ui.goto(root + "/popup.html")
  await ui.getByRole("heading", { name: "Design Library" }).waitFor()
  const cover = await context.newPage()
  await cover.setViewportSize({ width: 1280, height: 800 })
  for (const [name, title] of [
    ["vault", "Your project logins, together."],
    ["categories", "Choose what to save."],
  ]) {
    if (name === "categories")
      await ui.getByRole("button", { name: "Add item" }).click()
    await ui.evaluate(() => document.fonts.ready)
    await ui.waitForTimeout(350)
    const shot = await ui.screenshot({
      animations: "disabled",
      style: ".vault-detail > div.mt-5 {visibility:hidden}",
    })
    await cover.setContent(
      "<style>*{box-sizing:border-box}body{margin:0;background:#182341;color:#fff;font:26px system-ui;display:grid;justify-items:center;align-content:center;gap:28px;height:100vh}h1{font-size:46px;margin:0}img{height:550px;border-radius:10px;box-shadow:0 14px 50px #0006}</style><h1>" +
        title +
        '</h1><img src="data:image/png;base64,' +
        shot.toString("base64") +
        '">'
    )
    await cover.locator("img").evaluate((img) => img.decode())
    await cover.screenshot({ path: out + "/" + name + ".png" })
  }
} finally {
  await context.close()
  await rm(profile, { recursive: true, force: true })
}
