import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
const origin = process.env.DEVLOGIN_ORIGIN ?? "https://devlogin.peacockindia.in"
const status = await fetch(`${origin}/api/auth/status`, {
  signal: AbortSignal.timeout(15000),
})
if (status.status !== 200) throw new Error("Auth status endpoint failed")
const { configured } = await status.json()
for (const path of [
  "/api/me",
  "/api/projects",
  "/api/accounts",
  "/api/users",
  "/api/preferences",
  "/api/sync",
]) {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(15000),
  })
  if (response.status !== 401)
    throw new Error(`Anonymous access was not denied: ${path}`)
  if (response.headers.get("Cache-Control") !== "no-store")
    throw new Error(`Missing no-store: ${path}`)
}
const extension = resolve("apps/extension/.output/chrome-mv3")
const browser = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
})
try {
  const worker =
    browser.serviceWorkers()[0] ?? (await browser.waitForEvent("serviceworker"))
  const extensionId = worker.url().split("/")[2]
  const connection = await worker.evaluate(async (origin) => {
    const status = await fetch(`${origin}/api/auth/status`)
    const protectedResponse = await fetch(`${origin}/api/projects`)
    const start = await fetch(
      `${origin}/api/auth/google?${new URLSearchParams({ redirect_uri: chrome.identity.getRedirectURL(), code_challenge: "a".repeat(43) })}`,
      { redirect: "manual" }
    )
    return {
      status: status.status,
      configured: (await status.json()).configured,
      protected: protectedResponse.status,
      oauth:
        start.type === "opaqueredirect"
          ? "allowed redirect"
          : `status ${start.status}`,
    }
  }, origin)
  if (
    connection.status !== 200 ||
    connection.protected !== 401 ||
    (configured && connection.oauth !== "allowed redirect")
  )
    throw new Error("Built extension could not connect to production OAuth/API")
  const popup = await browser.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup
    .getByRole("button", { name: "Continue with Google", exact: true })
    .waitFor({ state: "visible" })
  await popup.close()
  const page = await browser.newPage()
  const response = await page.goto(origin)
  if (response?.status() !== 200) throw new Error("Dashboard failed")
  const button = page.getByRole("button", {
    name: "Continue with Google",
    exact: true,
  })
  await button.waitFor({ state: "visible" })
  await button.isEnabled().then((enabled) => {
    if (!enabled) throw new Error("Login did not finish loading")
  })
  mkdirSync("test-results", { recursive: true })
  await page.screenshot({
    path: "test-results/deployed-login.png",
    fullPage: true,
  })
  if (!configured) {
    await button.click()
    await page
      .getByRole("alert")
      .filter({ hasText: "Google OAuth is not configured yet" })
      .waitFor({ state: "visible" })
  } else {
    const start = await fetch(`${origin}/api/auth/google`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    })
    const authorization = new URL(start.headers.get("Location") ?? origin)
    if (
      start.status !== 302 ||
      authorization.hostname !== "accounts.google.com" ||
      authorization.searchParams.get("redirect_uri") !==
        `${origin}/api/auth/callback` ||
      authorization.searchParams.get("code_challenge_method") !== "S256"
    )
      throw new Error("Google authorization redirect is invalid")
    await button.click()
    await page.waitForURL((url) => url.hostname === "accounts.google.com", {
      timeout: 20000,
    })
    await page
      .getByRole("heading", { name: /Sign in|Choose an account/i })
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
  }
  console.log(
    JSON.stringify({
      origin,
      extensionId,
      extensionConnection: connection,
      dashboard: "200",
      protectedEndpoints: "401 / no-store",
      googleConfigured: configured,
      googleSignInPage: configured ? "verified" : "not configured",
      completedGoogleSignIn: "requires user sign-in",
    })
  )
} finally {
  await browser.close()
}
