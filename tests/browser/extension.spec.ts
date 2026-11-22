import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Worker,
  type Page,
} from "@playwright/test"
import { resolve } from "node:path"
import type { Account } from "@workspace/shared"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"

let context: BrowserContext
let worker: Worker
let token: string
let extensionId: string
const backend = "http://localhost:8799"
const fixture = "http://localhost:8798"
const profile = mkdtempSync(resolve(tmpdir(), "devlogin-browser-"))
async function launch(nativeWindow = false) {
  const extension = resolve("apps/extension/.output/chrome-mv3")
  context = await chromium.launchPersistentContext(
    nativeWindow ? "" : profile,
    {
      // Window-position tests need native window bounds instead of an emulated viewport.
      ...(nativeWindow ? { viewport: null } : {}),
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    }
  )
  worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
}
test.beforeAll(async () => {
  await launch()
  extensionId = worker.url().split("/")[2]!
  console.log(`Unpacked extension ID: ${extensionId}`)
  token = (
    (await (await fetch(`${backend}/fixture/token`)).json()) as {
      token: string
    }
  ).token
})
test.afterAll(async () => {
  await context?.close()
})
const windowTest =
  "popup manages projects and opens standalone windows to add and edit logins"
test.afterEach(async ({}, info) => {
  if (info.title === windowTest) {
    await context.close()
    await launch()
  }
})
test.beforeEach(async ({}, info) => {
  if (info.title === windowTest) {
    await context.close()
    await launch(true)
  }

  await fetch(`${backend}/fixture/reset`)
  await worker.evaluate(
    async ({ token, backend }) => {
      // Chrome APIs are provided by the installed extension's real service worker.
      // @ts-expect-error browser global
      await chrome.storage.local.set({
        token,
        origin: backend,
        excluded: [],
        uiSettings: { theme: "dark", submitAfterFill: false },
        localBindings: [
          {
            projectId: "fixture-project",
            origin: "http://localhost:8798",
            identity: {
              title: "Fixture login",
              application: "Fixture app",
              site: "",
            },
          },
          {
            projectId: "fixture-project",
            origin: "http://127.0.0.1:8798",
            identity: {
              title: "Fixture login",
              application: "Fixture app",
              site: "",
            },
          },
        ],
      })
      // @ts-expect-error browser global
      await chrome.storage.session.clear()
    },
    { token, backend }
  )
  const ui = await popup()
  await expect(
    ui.getByRole("button", { name: "Project filter", exact: true })
  ).toBeVisible()
  await ui.close()
})
async function api(path: string, method: string, body: unknown) {
  const response = await fetch(`${backend}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  expect(response.ok).toBeTruthy()
  return response.json()
}
async function automatic(enabled: boolean) {
  return api("/preferences", "PUT", {
    project_id: "fixture-project",
    account_id: "fixture-account",
    auto_login: enabled,
  })
}
async function popup() {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(
    page.getByRole("button", { name: "Project filter", exact: true })
  ).toBeVisible()
  return page
}
async function activate(page: Page) {
  const address = page.url()
  await worker.evaluate(async (address) => {
    // @ts-expect-error browser global
    const tabs = await chrome.tabs.query({})
    const tab = tabs.find((item: { url: string }) => item.url === address)
    // @ts-expect-error browser global
    await chrome.tabs.update(tab.id, { active: true })
  }, address)
}
test("auto-login OFF leaves a delayed React form untouched", async () => {
  await automatic(false)
  const page = await context.newPage()
  await page.goto(`${fixture}/login?react=1&delayed=1`)
  await expect(page.locator("#password")).toBeVisible()
  // Allow the content script's next automatic check to run.
  await page.waitForTimeout(4000)
  await expect(page.locator("#email")).toHaveValue("")
  await expect(page.locator("#password")).toHaveValue("")
  expect(await page.locator("body").getAttribute("data-submitted")).toBeNull()
  await page.close()
})
test("auto-login fills a React controlled form, submits once, and stops reload loops", async () => {
  await automatic(true)
  const fresh = await popup()
  await expect(
    fresh.getByRole("button", { name: "Project filter", exact: true })
  ).toBeVisible()
  await fresh.close()
  const page = await context.newPage()
  await page.goto(`${fixture}/login?react=1&delayed=1`)
  await expect(page.locator("body")).toHaveAttribute(
    "data-submitted",
    JSON.stringify({
      email: "login@example.com",
      password: "fixture-password",
    }),
    { timeout: 15_000 }
  )
  await expect(page.locator("body")).toHaveAttribute("data-count", "1")
  await page.reload()
  await expect(page.locator("#password")).toBeVisible()
  await page.waitForTimeout(4000)
  expect(await page.locator("body").getAttribute("data-submitted")).toBeNull()
  await page.close()
})
test("manual Fill only and Login work through the real background service worker", async () => {
  await automatic(false)
  const page = await context.newPage()
  await page.goto(`${fixture}/login`)
  const ui = await popup()
  await activate(page)
  await ui.evaluate(async () => {
    // @ts-expect-error browser global
    const result = await chrome.runtime.sendMessage({
      type: "manual",
      accountId: "fixture-account",
      submit: false,
    })
    if (!result.ok) throw new Error(result.error)
  })
  await expect(page.locator("#email")).toHaveValue("login@example.com")
  await expect(page.locator("#password")).toHaveValue("fixture-password")
  expect(await page.locator("body").getAttribute("data-submitted")).toBeNull()
  await ui.evaluate(async () => {
    // @ts-expect-error browser global
    const result = await chrome.runtime.sendMessage({
      type: "manual",
      accountId: "fixture-account",
      submit: true,
    })
    if (!result.ok) throw new Error(result.error)
  })
  await expect(page.locator("body")).toHaveAttribute("data-count", "1")
  await ui.close()
  await page.close()
})
test("custom selectors handle fields outside default detection", async () => {
  await api("/projects/fixture-project", "PUT", {
    name: "Fixture app",
    urls: [fixture],
    login_path: "/login",
    selectors: {
      email: "#identity",
      password: "#secret",
      submit: "#submit-login",
      google: "",
    },
  })
  await automatic(true)
  const fresh = await popup()
  await expect(
    fresh.getByRole("button", { name: "Project filter", exact: true })
  ).toBeVisible()
  await fresh.close()
  const page = await context.newPage()
  await page.goto(`${fixture}/login?custom=1`)
  await expect(page.locator("body")).toHaveAttribute(
    "data-submitted",
    JSON.stringify({
      email: "login@example.com",
      password: "fixture-password",
    }),
    { timeout: 15_000 }
  )
  await page.close()
})
test(windowTest, async () => {
  const ui = await popup()
  await ui.getByRole("button", { name: "Project filter", exact: true }).click()
  await ui
    .getByRole("menuitem", { name: "Manage Projects", exact: true })
    .click()
  await ui.getByRole("button", { name: "Create Project", exact: true }).click()
  await ui.getByRole("button", { name: "Change icon preview" }).click()
  await ui.getByRole("button", { name: "More emojis", exact: true }).click()
  await ui
    .getByRole("textbox", { name: "Search emojis or paste one" })
    .fill("dragon")
  await ui
    .getByRole("button", { name: "Use dragon emoji", exact: true })
    .click()
  await ui
    .getByLabel("Project name", { exact: true })
    .fill("Browser-created project")
  await ui.getByRole("button", { name: /Create Project|Save Project/ }).click()
  await expect(ui.getByRole("button", { name: "Project filter" })).toBeVisible()
  await ui.getByRole("button", { name: "Logins", exact: true }).click()
  await ui.getByRole("button", { name: "Add item" }).click()
  const [newLogin] = await Promise.all([
    context.waitForEvent("page"),
    ui.getByRole("menuitem", { name: /Login$/ }).click(),
  ])
  await expect(newLogin).toHaveURL(/edit-login\.html/)
  const center = (page: Page) =>
    page.evaluate(async () => {
      // @ts-expect-error Chrome extension window API
      const w = await chrome.windows.getCurrent()
      return { x: w.left + w.width / 2, y: w.top + w.height / 2 }
    })
  const parentCenter = await center(ui),
    editorCenter = await center(newLogin)
  expect(Math.abs(editorCenter.x - parentCenter.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(editorCenter.y - parentCenter.y)).toBeLessThanOrEqual(1)
  await expect(ui.getByRole("dialog")).toBeHidden()
  await newLogin.getByLabel("Title", { exact: true }).fill("Browser account")
  await newLogin
    .getByLabel("Username / Email", { exact: true })
    .fill("browser@example.com")
  await newLogin
    .getByLabel("Password", { exact: true })
    .fill("browser-password")
  await Promise.all([
    newLogin.waitForEvent("close"),
    newLogin.getByRole("button", { name: "Save Login" }).click(),
  ])
  await expect(
    ui.getByRole("heading", { name: "Browser account", exact: true })
  ).toBeVisible()
  await ui.getByRole("button", { name: "Login actions" }).click()
  const [editLogin] = await Promise.all([
    context.waitForEvent("page"),
    ui.getByRole("menuitem", { name: "Edit login", exact: true }).click(),
  ])
  await expect(editLogin).toHaveURL(/edit-login\.html/)
  await expect(
    editLogin.getByRole("heading", { name: "Edit login" })
  ).toBeVisible()
  expect(
    await editLogin.evaluate(async () => {
      // @ts-expect-error browser global
      return (await chrome.windows.getCurrent()).type
    })
  ).toBe("popup")
  await editLogin
    .getByLabel("Title", { exact: true })
    .fill("Updated browser account")
  await Promise.all([
    editLogin.waitForEvent("close"),
    editLogin.getByRole("button", { name: "Save Login" }).click(),
  ])
  await expect(
    ui.getByRole("heading", { name: "Updated browser account", exact: true })
  ).toBeVisible()
  await ui.getByRole("button", { name: "Login actions" }).click()
  await ui.getByRole("menuitem", { name: "Delete login", exact: true }).click()
  await ui
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click()
  await expect(ui.getByRole("dialog")).not.toBeVisible()
  await ui.close()
})
test("full-tab onboarding saves only tutorial progress", async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/welcome.html`)
  await expect(
    page.getByRole("heading", { name: "Welcome to Global Login" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Set up Global Login" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Sign in with Google" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Start practice tutorial" }).click()
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "developer@example.test"
  )
  await page.getByRole("button", { name: "Save sample login" }).click()
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("")
  await page.getByRole("button", { name: "Fill sample login" }).click()
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(
    "developer@example.test"
  )
  await page.getByRole("button", { name: "Finish tutorial" }).click()
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Repeat tutorial" })
  ).toBeVisible()
  expect(await savedAccounts()).toHaveLength(1)
  await page.close()
})

test("Google project action initiates the application sign-in button", async () => {
  const account = (await api("/accounts", "POST", {
    project_id: "fixture-project",
    label: "Google account",
    email: "google@example.com",
    login_type: "google",
    is_default: false,
  })) as { id: string }
  const page = await context.newPage()
  await page.goto(`${fixture}/login?google=1`)
  const ui = await popup()
  await activate(page)
  await ui.evaluate(async (accountId) => {
    // @ts-expect-error browser global
    const result = await chrome.runtime.sendMessage({
      type: "manual",
      accountId,
      submit: true,
    })
    if (!result.ok) throw new Error(result.error)
  }, account.id)
  await expect(page.locator("body")).toHaveAttribute("data-google", "opened")
  await ui.close()
  await page.close()
})
test("web dashboard pending screen hides workspace data; SQL approval refresh unlocks it", async () => {
  const page = await context.newPage()
  // An authenticated test session is provided by the isolated fixture server.
  await context.addCookies([
    {
      name: "devlogin_session",
      value: token,
      url: backend,
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
  await page.goto(backend)
  await expect(page.getByLabel("Search logins")).toBeVisible()
  await page.getByRole("button", { name: /Fixture account/ }).click()
  await expect(
    page.getByRole("button", { name: "Show password", exact: true })
  ).toBeVisible()
  await fetch(`${backend}/fixture/approval?approved=false`)
  await page.getByRole("button", { name: "Profile menu" }).click()
  await page.getByRole("menuitem", { name: "Refresh", exact: true }).click()
  await expect(
    page.getByText("Waiting for Approval", { exact: true })
  ).toBeVisible()
  await expect(page.getByLabel("Search logins")).not.toBeVisible()
  await fetch(`${backend}/fixture/approval?approved=true`)
  await page
    .getByRole("button", { name: "Check approval", exact: true })
    .click()
  await expect(page.getByLabel("Search logins")).toBeVisible()
  await page.close()
})

async function savedAccounts() {
  return (await (
    await fetch(`${backend}/api/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as Account[]
}
async function loginPage() {
  const page = await context.newPage()
  await page.goto(`${fixture}/login`)
  await expect(page.locator("devlogin-ui")).toBeAttached()
  // Wait for approved-user metadata, then focus a real login field.
  await expect(async () => {
    await page.locator("#email").blur()
    await page.locator("#email").focus()
    await expect(
      page.getByRole("region", { name: "Global Login accounts" })
    ).toBeVisible()
  }).toPass()
  return page
}

test("inline suggestions show website favicons by default and saved emoji overrides", async () => {
  await api("/accounts/fixture-account", "PUT", {
    project_id: "fixture-project",
    label: "Fixture account",
    email: "login@example.com",
    login_type: "password",
    websites: [{ url: fixture }],
    icon: "",
  })
  await api("/accounts", "POST", {
    project_id: "fixture-project",
    label: "Emoji account",
    email: "emoji@example.com",
    login_type: "password",
    password: "emoji-secret",
    websites: [{ url: fixture }],
    icon: "🚀",
  })
  const ui = await popup()
  await ui.close()
  const page = await loginPage()
  const defaultRow = page.getByRole("button", {
    name: "Fixture account · login@example.com",
    exact: true,
  })
  await expect(defaultRow.locator("img")).toHaveAttribute(
    "src",
    `${fixture}/favicon.ico`
  )
  await expect
    .poll(() =>
      defaultRow
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth)
    )
    .toBe(32)
  const emojiRow = page.getByRole("button", {
    name: "Emoji account · emoji@example.com",
    exact: true,
  })
  await expect(emojiRow.locator(".login-icon")).toHaveText("🚀")
  await expect(emojiRow.locator("img")).toHaveCount(0)

  await page.close()
})
test("in-page dropdown opens on focus, highlights the whole row, and fills both fields", async () => {
  const page = await loginPage()
  const menu = page.getByRole("region", { name: "Global Login accounts" })
  const row = page.getByRole("button", {
    name: "Fixture account · login@example.com",
    exact: true,
  })
  await expect(menu).toBeVisible()
  await expect(menu.locator(".account-label")).toHaveText("Fixture account")
  await expect(menu.locator(".account-email")).toHaveText("login@example.com")
  await expect(
    menu.getByRole("button", { name: "Manage Accounts", exact: true })
  ).toBeVisible()
  expect(
    await menu.evaluate((el) => el.getBoundingClientRect().width)
  ).toBeGreaterThanOrEqual(300)
  const base = await row.evaluate((el) => getComputedStyle(el).backgroundColor)
  await row.hover()
  await expect
    .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(base)
  expect(await row.evaluate((el) => getComputedStyle(el).cursor)).toBe(
    "pointer"
  )
  expect(
    await row.evaluate((el) => getComputedStyle(el).transitionDuration)
  ).toContain("0.15s")
  await page.screenshot({ path: "test-results/inline-autofill-dropdown.png" })
  await row.click()
  await expect(page.locator("#email")).toHaveValue("login@example.com")
  await expect(page.locator("#password")).toHaveValue("fixture-password")
  await expect(menu).not.toBeVisible()
  expect(await page.locator("body").getAttribute("data-count")).toBeNull()
  await page.close()
})
test("inline dropdown keyboard selection, Escape, outside click and blur-safe selection", async () => {
  const page = await loginPage()
  const menu = page.getByRole("region", { name: "Global Login accounts" })
  const row = page.getByRole("button", {
    name: "Fixture account · login@example.com",
    exact: true,
  })
  await page.keyboard.press("ArrowDown")
  await expect(row).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(menu).not.toBeVisible()
  await expect(page.locator("#email")).toBeFocused()
  await page.locator("#email").blur()
  await page.locator("#email").focus()
  await page.mouse.click(800, 500)
  await expect(menu).not.toBeVisible()
  await page.locator("#password").focus()
  await expect(menu).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(page.locator("#email")).toHaveValue("login@example.com")
  await expect(page.locator("#password")).toHaveValue("fixture-password")
  await expect(menu).not.toBeVisible()
  await page.locator("#email").focus()
  await page.evaluate(() =>
    document.querySelector("#email")!.addEventListener("blur", () => {
      document.body.dataset.blurred = "true"
    })
  )
  await row.click()
  await expect(page.locator("#password")).toHaveValue("fixture-password")
  // Autofill itself blurs inputs after setting them; the row still completes.
  await expect(menu).not.toBeVisible()
  await page.close()
})
test("inline dropdown tracks its input when scrolling and resizing and opens management", async () => {
  const page = await loginPage()
  await page.addStyleTag({
    content:
      "body{height:1600px}form{margin-top:180px}input{width:400px;display:block;height:36px}",
  })
  await page.locator("#email").blur()
  await page.locator("#email").focus()
  const menu = page.getByRole("region", { name: "Global Login accounts" })
  const aligned = async () => {
    const input = await page.locator("#email").boundingBox()
    const dropdown = await menu.boundingBox()
    expect(Math.abs(dropdown!.y - (input!.y + input!.height + 4))).toBeLessThan(
      2
    )
    expect(dropdown!.width).toBeLessThanOrEqual(340)
    expect(dropdown!.x + dropdown!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width
    )
  }
  await aligned()
  await page.evaluate(() => window.scrollTo(0, 100))
  await expect(async () => await aligned()).toPass()
  await page.setViewportSize({ width: 320, height: 640 })
  await expect(async () => await aligned()).toPass()
  const opened = context.waitForEvent("page")
  await menu
    .getByRole("button", { name: "Manage Accounts", exact: true })
    .click()
  const management = await opened
  await management.waitForURL(backend + "/")
  await expect(menu).not.toBeVisible()
  await management.close()
  await page.close()
})
test("inline dropdown stays hidden when no accounts match", async () => {
  await api("/projects", "POST", {
    name: "Empty project",
    urls: ["http://127.0.0.1:8798"],
    login_path: "/login",
  })
  const ui = await popup()
  await ui.close()
  const page = await context.newPage()
  await page.goto("http://127.0.0.1:8798/login")
  await page.locator("#email").focus()
  await page.waitForTimeout(1200)
  await expect(
    page.getByRole("region", { name: "Global Login accounts" })
  ).not.toBeVisible()
  await page.close()
})

test("manual new login is confirmed before saving; ciphertext sync and web see it", async () => {
  const page = await loginPage()
  await page.locator("#email").fill("new@example.com")
  await page.locator("#password").fill("new-password")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  const prompt = page.getByRole("dialog", {
    name: "Save login to Global Login?",
  })
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText("Sign-in not verified")
  await page.screenshot({ path: "test-results/save-login-prompt.png" })
  expect((await savedAccounts()).length).toBe(1)
  // The host website must not be able to confirm a save through a scripted click.
  await page.evaluate(() =>
    document
      .querySelector("devlogin-ui")!
      .shadowRoot!.querySelector<HTMLButtonElement>(".primary")!
      .click()
  )
  expect((await savedAccounts()).length).toBe(1)
  await prompt.getByRole("button", { name: "Edit", exact: true }).click()
  await prompt.getByLabel("Account label").fill("New developer")
  await prompt.getByRole("button", { name: "Save login", exact: true }).click()
  await expect(page.getByText("Login saved", { exact: true })).toBeVisible()
  const accounts = await savedAccounts()
  expect(accounts.length).toBe(2)
  const saved = accounts.find((a) => a.email === "new@example.com")!
  expect(saved.websites?.[0]?.url).toBe(`${fixture}/`)
  expect(
    (await api(`/accounts/${saved.id}/password`, "POST", {})).password
  ).toBe("new-password")
  await context.addCookies([
    {
      name: "devlogin_session",
      value: token,
      url: backend,
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
  const web = await context.newPage()
  await web.goto(backend)
  await expect(web.getByText("New developer", { exact: true })).toBeVisible()
  await web.close()
  await page.close()
})
test("different login password updates the existing record; Not now preserves it", async () => {
  const page = await loginPage()
  await page.locator("#email").fill("login@example.com")
  await page.locator("#password").fill("changed-password")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  const prompt = page.getByRole("dialog", {
    name: "Update password in Global Login?",
  })
  await expect(prompt).toBeVisible()
  await prompt.getByRole("button", { name: "Not now" }).click()
  expect(
    (await api("/accounts/fixture-account/password", "POST", {})).password
  ).toBe("fixture-password")
  await page.waitForTimeout(5100)
  await page.getByRole("button", { name: "Login", exact: true }).click()
  await expect(prompt).toBeVisible()
  await page.screenshot({ path: "test-results/update-password-prompt.png" })
  await prompt.getByRole("button", { name: "Update saved" }).click()
  await expect(
    page.getByText("Password updated", { exact: true })
  ).toBeVisible()
  expect((await savedAccounts()).length).toBe(1)
  expect(
    (await api("/accounts/fixture-account/password", "POST", {})).password
  ).toBe("changed-password")
  await page.close()
})
test("change password uses matching new/confirm fields and ignores mismatches", async () => {
  const page = await context.newPage()
  await page.goto(`${fixture}/settings?change=1`)
  // Metadata check is asynchronous even when auto-login is off.
  await page.waitForTimeout(1500)
  await page.locator("#email").fill("login@example.com")
  await page.locator("#current").fill("fixture-password")
  await page.locator("#new").fill("replacement-password")
  await page.locator("#confirm").fill("mismatched")
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click()
  await page.waitForTimeout(1200)
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await page.locator("#confirm").fill("replacement-password")
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click()
  await page
    .getByRole("dialog", { name: "Update password in Global Login?" })
    .getByRole("button", { name: "Update saved" })
    .click()
  await expect(
    page.getByText("Password updated", { exact: true })
  ).toBeVisible()
  expect(
    (await api("/accounts/fixture-account/password", "POST", {})).password
  ).toBe("replacement-password")
  await page.close()
})
test("signup saves a new account and reset password allows choosing an existing account", async () => {
  const page = await context.newPage()
  await page.goto(`${fixture}/signup?signup=1`)
  await page.waitForTimeout(1500)
  await page.locator("#email").fill("signup@example.com")
  await page.locator("#new").fill("signup-password")
  await page.locator("#confirm").fill("signup-password")
  await page.getByRole("button", { name: "Register", exact: true }).click()
  await page
    .getByRole("dialog", { name: "Save login to Global Login?" })
    .getByRole("button", { name: "Save login", exact: true })
    .click()
  await expect(page.getByText("Login saved", { exact: true })).toBeVisible()
  const created = (await savedAccounts()).find(
    (a) => a.email === "signup@example.com"
  )!
  await page.goto(`${fixture}/reset?reset=1`)
  await page.waitForTimeout(1500)
  await page.locator("#new").fill("reset-password")
  await page.locator("#confirm").fill("reset-password")
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click()
  const prompt = page.getByRole("dialog", {
    name: "Update password in Global Login?",
  })
  await expect(prompt).toBeVisible()
  await prompt.getByRole("radio", { name: new RegExp(created.email) }).check()
  await prompt.getByRole("button", { name: "Update saved" }).click()
  await expect(
    page.getByText("Password updated", { exact: true })
  ).toBeVisible()
  expect((await savedAccounts()).length).toBe(2)
  expect(
    (await api(`/accounts/${created.id}/password`, "POST", {})).password
  ).toBe("reset-password")
  expect(
    (await api("/accounts/fixture-account/password", "POST", {})).password
  ).toBe("fixture-password")
  await page.close()
})
test("unknown enabled website offers project creation; navigation keeps only a short-lived confirmation", async () => {
  const page = await context.newPage()
  await page.goto("http://127.0.0.1:8798/login")
  await page.waitForTimeout(1500)
  await page.locator("#email").fill("unknown@example.com")
  await page.locator("#password").fill("unknown-password")
  // A real navigation removes the original form and content-script instance.
  await page.evaluate(() =>
    document.querySelector("form")!.addEventListener("submit", () => {
      location.href = "/home"
    })
  )
  await page.getByRole("button", { name: "Login", exact: true }).click()
  await page.waitForURL("**/home")
  const prompt = page.getByRole("dialog", {
    name: "Save login to Global Login?",
  })
  await expect(prompt).toBeVisible()
  await prompt.getByLabel("Project name").fill("Discovered local app")
  await prompt.getByRole("button", { name: "Save login", exact: true }).click()
  await expect(page.getByText("Login saved", { exact: true })).toBeVisible()
  expect(
    (await savedAccounts()).some(
      (a) =>
        a.email === "unknown@example.com" &&
        a.websites?.some((site) => site.url === "http://127.0.0.1:8798/")
    )
  ).toBeTruthy()
  await page.close()
})
test("auto-login does not overwrite populated fields; excluded sites never capture", async () => {
  await automatic(true)
  const page = await context.newPage()
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      const email = document.querySelector<HTMLInputElement>("#email")
      if (email) email.value = "typed@example.com"
    })
  )
  await page.goto(`${fixture}/login`)
  await page.waitForTimeout(4000)
  await expect(page.locator("#email")).toHaveValue("typed@example.com")
  await expect(page.locator("#password")).toHaveValue("")
  expect(await page.locator("body").getAttribute("data-count")).toBeNull()
  const ui = await popup()
  await ui.evaluate(async (origin) => {
    // @ts-expect-error Chrome global
    await chrome.runtime.sendMessage({
      type: "exclude",
      origin,
      excluded: true,
    })
  }, fixture)
  await page.reload()
  await page.waitForTimeout(1500)
  await page.locator("#password").fill("do-not-save")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  await page.waitForTimeout(1200)
  await expect(page.getByRole("dialog")).not.toBeVisible()
  expect((await savedAccounts()).length).toBe(1)
  await ui.close()
  await page.close()
})
test("web creates, edits and deletes accounts and projects with extension sync", async () => {
  test.setTimeout(60_000)
  await context.addCookies([
    {
      name: "devlogin_session",
      value: token,
      url: backend,
      httpOnly: true,
      sameSite: "Lax",
    },
  ])
  const web = await context.newPage()
  await web.goto(backend)
  await web.getByRole("button", { name: "Add Project", exact: true }).click()
  await web
    .getByLabel("Project name", { exact: true })
    .fill("Web managed project")
  await web.getByRole("button", { name: /Create Project|Save Project/ }).click()
  await expect(web.getByRole("dialog")).toBeHidden()
  await expect(
    web.getByRole("button", { name: "Add item", exact: true })
  ).toBeVisible()
  await web.getByRole("button", { name: "Add item", exact: true }).click()
  await web.getByRole("menuitem", { name: /Login$/ }).click()
  await web.getByLabel("Title", { exact: true }).fill("Web login")
  await web
    .getByLabel("Username / Email", { exact: true })
    .fill("web@example.com")
  await web.getByLabel("Password", { exact: true }).fill("web-password")
  await web.getByRole("button", { name: "Save Login" }).click()
  await expect(web.getByRole("dialog")).toBeHidden()
  await expect(
    web.getByRole("heading", { name: "Web login", exact: true })
  ).toBeVisible()
  await web.screenshot({ path: "test-results/web-account-management.png" })
  const ui = await popup()
  await ui.getByRole("button", { name: "Project filter", exact: true }).click()
  await ui
    .getByRole("menuitem", { name: "Manage Projects", exact: true })
    .click()
  await expect(
    ui.getByText("Web managed project", { exact: true })
  ).toBeVisible()
  await web.getByRole("button", { name: "Edit", exact: true }).click()
  await web.getByLabel("Title", { exact: true }).fill("Edited web login")
  await web.getByRole("button", { name: "Save Login" }).click()
  await expect(web.getByRole("dialog")).toBeHidden()
  await expect(
    web.getByRole("heading", { name: "Edited web login", exact: true })
  ).toBeVisible()
  await web.getByRole("button", { name: "Login actions" }).click()
  await web.getByRole("menuitem", { name: "Delete login" }).click()
  await web
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click()
  await expect(
    web.getByRole("heading", { name: "Edited web login", exact: true })
  ).not.toBeVisible()
  await web.getByRole("button", { name: "Project actions" }).click()
  await web.getByRole("menuitem", { name: "Edit project" }).click()
  await web
    .getByLabel("Project name", { exact: true })
    .fill("Renamed web project")
  await web.getByRole("button", { name: /Create Project|Save Project/ }).click()
  await expect(web.getByRole("dialog")).toBeHidden()
  await expect(
    web.getByRole("button", { name: "Renamed web project 0", exact: true })
  ).toBeVisible()
  await web.getByRole("button", { name: "Project actions" }).click()
  await web.getByRole("menuitem", { name: "Delete project" }).click()
  await web
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click()
  await expect(
    web.getByRole("button", { name: "Renamed web project 0", exact: true })
  ).not.toBeVisible()
  await ui.close()
  await web.close()
})
test("environment-scoped accounts never fill a sibling environment", async () => {
  await api("/projects/fixture-project", "PUT", {
    name: "Fixture app",
    urls: [fixture, "http://127.0.0.1:8798"],
    login_path: "/login",
  })
  const scoped = await api("/accounts", "POST", {
    project_id: "fixture-project",
    label: "Other environment",
    email: "other@example.com",
    password: "other-password",
    environment: "http://127.0.0.1:8798",
    login_type: "password",
    is_default: false,
  })
  const page = await loginPage()
  await expect(
    page.getByRole("button", { name: /Other environment/ })
  ).not.toBeVisible()
  const ui = await popup()
  await activate(page)
  const result = await ui.evaluate(async (accountId) => {
    // @ts-expect-error Chrome global
    return chrome.runtime.sendMessage({
      type: "manual",
      accountId,
      submit: false,
    })
  }, scoped.id)
  expect(result.ok).toBe(false)
  await expect(page.locator("#password")).toHaveValue("")
  await ui.close()
  await page.close()
})
test("browser restart preserves authentication and site registration without persisting passwords", async () => {
  const page = await loginPage()
  await page.locator("#email").fill("transient@example.com")
  await page.locator("#password").fill("transient-password")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  await expect(
    page.getByRole("dialog", { name: "Save login to Global Login?" })
  ).toBeVisible()
  await context.close()
  await launch()
  const ui = await popup()
  await expect(
    ui.getByRole("button", { name: "Project filter", exact: true })
  ).toBeVisible()
  const stored = await worker.evaluate(async () => {
    // @ts-expect-error Chrome global
    return {
      local: await chrome.storage.local.get(null),
      session: await chrome.storage.session.get(null),
    }
  })
  expect(JSON.stringify(stored)).not.toContain("transient-password")
  expect(JSON.stringify(stored)).not.toContain("fixture-password")
  const restored = await loginPage()
  await expect(restored.getByRole("dialog")).not.toBeVisible()
  await restored
    .getByRole("button", { name: /Fixture account · login@example.com/ })
    .click()
  await expect(restored.locator("#password")).toHaveValue("fixture-password")
  await ui.close()
  await restored.close()
})
test("unapproved users and regular members cannot capture or save shared credentials", async () => {
  await fetch(`${backend}/fixture/approval?approved=false`)
  const page = await context.newPage()
  await page.goto(`${fixture}/login`)
  await page.waitForTimeout(1500)
  await page.locator("#email").fill("blocked@example.com")
  await page.locator("#password").fill("blocked-password")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  await page.waitForTimeout(1000)
  await expect(page.getByRole("dialog")).not.toBeVisible()
  const response = await fetch(`${backend}/api/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status).toBe(403)
  await fetch(`${backend}/fixture/approval?approved=true`)
  await fetch(`${backend}/fixture/member`)
  await page.reload()
  await page.waitForTimeout(1500)
  await page.locator("#email").fill("member@example.com")
  await page.locator("#password").fill("member-password")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  await page.waitForTimeout(1000)
  await expect(page.getByRole("dialog")).not.toBeVisible()
  expect((await savedAccounts()).length).toBe(1)
  await page.close()
})
test("all websites are granted at install, so unknown sites need no per-site permission", async () => {
  const granted = await worker.evaluate(async () => {
    // @ts-expect-error Chrome global
    return chrome.permissions.contains({
      origins: ["https://unregistered.example.test/*"],
    })
  })
  expect(granted).toBe(true)
})

test("inline autofill defaults to submit for mouse and input Enter", async () => {
  await worker.evaluate(async () => {
    // @ts-expect-error browser global
    await chrome.storage.local.remove("uiSettings")
  })
  for (const method of ["click", "enter"]) {
    const page = await loginPage()
    if (method === "click")
      await page
        .getByRole("button", { name: /Fixture account · login@example.com/ })
        .click()
    else await page.locator("#email").press("Enter")
    await expect(page.locator("#password")).toHaveValue("fixture-password")
    await expect(page.locator("body")).toHaveAttribute("data-count", "1")
    await expect(
      page.getByRole("region", { name: "Global Login accounts" })
    ).not.toBeVisible()
    await page.close()
  }
})

test("appearance and submit settings persist and update the inline UI live", async () => {
  const page = await loginPage()
  const menu = page.getByRole("region", { name: "Global Login accounts" })
  await expect(menu).toHaveClass(/dark/)
  const dark = await menu.evaluate((el) => getComputedStyle(el).backgroundColor)
  // A website's variables must not leak into the extension's light palette.
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--popover", "transparent")
    document.documentElement.style.setProperty("--popover-foreground", "red")
    document.documentElement.style.setProperty("--muted-foreground", "red")
  })
  const ui = await popup()
  await ui.getByRole("button", { name: "Settings menu", exact: true }).click()
  await ui.getByRole("menuitem", { name: "Settings", exact: true }).click()
  const submit = ui.getByRole("switch", { name: "Submit after autofill" })
  await expect(submit).not.toBeChecked()
  await submit.click()
  await expect(submit).toBeChecked()
  await submit.click()
  await expect(submit).not.toBeChecked()
  await ui.getByRole("combobox", { name: "Appearance" }).click()
  await ui.getByRole("option", { name: "Light", exact: true }).click()
  await expect(menu).not.toHaveClass(/dark/)
  expect(
    await menu.evaluate((el) => getComputedStyle(el).backgroundColor)
  ).not.toBe(dark)
  expect(
    await menu.evaluate((el) => {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 1
      const context = canvas.getContext("2d")!
      context.fillStyle = getComputedStyle(el).backgroundColor
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    })
  ).toEqual([255, 255, 255, 255])
  expect(
    await menu
      .locator(".account-email")
      .evaluate((el) => getComputedStyle(el).color)
  ).not.toBe("rgb(255, 0, 0)")
  await page.screenshot({ path: "test-results/inline-autofill-light.png" })
  await ui.close()
  const reopened = await popup()
  await reopened
    .getByRole("button", { name: "Settings menu", exact: true })
    .click()
  await reopened
    .getByRole("menuitem", { name: "Settings", exact: true })
    .click()
  await expect(
    reopened.getByRole("combobox", { name: "Appearance" })
  ).toContainText("Light")
  await expect(
    reopened.getByRole("switch", { name: "Submit after autofill" })
  ).not.toBeChecked()
  await page
    .getByRole("button", { name: /Fixture account · login@example.com/ })
    .click()
  await expect(page.locator("#password")).toHaveValue("fixture-password")
  expect(await page.locator("body").getAttribute("data-count")).toBeNull()
  await reopened.close()
  await page.close()
})

test("inline submit respects remaining required fields and closes after filling", async () => {
  await worker.evaluate(async () => {
    // @ts-expect-error browser global
    await chrome.storage.local.remove("uiSettings")
  })
  const page = await loginPage()
  await page.evaluate(() => {
    const required = document.createElement("input")
    required.required = true
    required.name = "verification"
    document.querySelector("form")!.append(required)
  })
  await page
    .getByRole("button", { name: /Fixture account · login@example.com/ })
    .click()
  await expect(page.locator("#password")).toHaveValue("fixture-password")
  await expect(
    page.getByRole("region", { name: "Global Login accounts" })
  ).not.toBeVisible()
  expect(await page.locator("body").getAttribute("data-count")).toBeNull()
  await page.close()
})

test("reused localhost port requires matching app metadata before filling", async () => {
  const other = await api("/projects", "POST", {
    name: "Other local app",
    urls: [fixture],
    login_path: "/login",
  })
  await api("/accounts", "POST", {
    project_id: other.id,
    label: "Other developer",
    email: "other@example.com",
    password: "other-password",
    login_type: "password",
    is_default: true,
  })
  const page = await loginPage()
  await page.evaluate(() => {
    document.title = "Other application login"
    document
      .querySelector('meta[name="application-name"]')!
      .setAttribute("content", "Other application")
  })
  await page.locator("#email").blur()
  await page.locator("#email").focus()
  await expect(
    page.getByRole("region", { name: "Global Login accounts" })
  ).not.toBeVisible()
  const ui = await popup()
  await activate(page)
  await ui.getByRole("button", { name: "Settings menu", exact: true }).click()
  await ui.getByRole("menuitem", { name: "Refresh", exact: true }).click()
  await ui.getByRole("button", { name: "Settings menu", exact: true }).click()
  await ui.getByRole("menuitem", { name: "Settings", exact: true }).click()
  await expect(
    ui.getByRole("button", { name: "Project filter", exact: true })
  ).toBeVisible()
  await ui.getByRole("combobox", { name: "Local project", exact: true }).click()
  await ui.getByRole("option", { name: "Other local app", exact: true }).click()
  await ui
    .getByRole("button", { name: "Identify this local project", exact: true })
    .click()
  await expect(
    ui.getByText("Local project identity saved", { exact: true })
  ).toBeVisible()
  await page.locator("#email").blur()
  await page.locator("#email").focus()
  await page
    .getByRole("button", {
      name: "Other developer · other@example.com",
      exact: true,
    })
    .click()
  await expect(page.locator("#email")).toHaveValue("other@example.com")
  await expect(page.locator("#password")).toHaveValue("other-password")
  await ui.close()
  await page.close()
})

test("metadata changing with the dropdown open blocks stale credential selection", async () => {
  const page = await loginPage()
  await page.evaluate(() =>
    document
      .querySelector('meta[name="application-name"]')!
      .setAttribute("content", "Different app")
  )
  await page
    .getByRole("button", { name: /Fixture account · login@example.com/ })
    .click()
  await expect(page.locator("#email")).toHaveValue("")
  await expect(page.locator("#password")).toHaveValue("")
  await page.close()
})

test("auto-login stops when another app occupies the same localhost URL", async () => {
  await automatic(true)
  const fresh = await popup()
  await fresh.close()
  const page = await context.newPage()
  await page.route(`${fixture}/login`, async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        'content="Fixture app"',
        'content="Another application"'
      ),
    })
  })
  await page.goto(`${fixture}/login`)
  await page.waitForTimeout(4000)
  await expect(page.locator("#email")).toHaveValue("")
  await expect(page.locator("#password")).toHaveValue("")
  expect(await page.locator("body").getAttribute("data-count")).toBeNull()
  await page.close()
})

test("identical metadata for two local projects never chooses one arbitrarily", async () => {
  const other = await api("/projects", "POST", {
    name: "Ambiguous app",
    urls: [fixture],
    login_path: "/login",
  })
  await api("/accounts", "POST", {
    project_id: other.id,
    label: "Other app account",
    email: "other@example.com",
    password: "other-password",
    login_type: "password",
    websites: [{ url: fixture }],
  })
  await worker.evaluate(async (projectId) => {
    // @ts-expect-error browser global
    const { localBindings } = await chrome.storage.local.get("localBindings")
    // @ts-expect-error browser global
    await chrome.storage.local.set({
      localBindings: [...localBindings, { ...localBindings[0], projectId }],
    })
  }, other.id)
  const page = await context.newPage()
  await page.goto(`${fixture}/login`)
  await expect(page.locator("devlogin-ui")).toBeAttached()
  await page.locator("#email").focus()
  await page.waitForTimeout(500)
  await expect(
    page.getByRole("region", { name: "Global Login accounts" })
  ).not.toBeVisible()
  const ui = await popup()
  await activate(page)
  const result = await ui.evaluate(async () => {
    // @ts-expect-error browser global
    return chrome.runtime.sendMessage({
      type: "manual",
      accountId: "fixture-account",
      submit: false,
    })
  })
  expect(result.ok).toBe(false)
  expect(result.error).toContain("identity does not match")
  await expect(page.locator("#password")).toHaveValue("")
  await ui.close()
  await page.close()
})
test("one login fills multiple configured websites and shares password updates", async () => {
  const project = await api("/projects", "POST", {
    name: "Multi-site folder",
    icon: "🚀",
  })
  const account = await api("/accounts", "POST", {
    project_id: project.id,
    label: "Shared multi-site login",
    email: "multi@example.com",
    password: "multi-secret",
    login_type: "password",
    websites: [
      { url: `${fixture}/login` },
      { url: "http://127.0.0.1:8798/login" },
    ],
  })
  await worker.evaluate(async (projectId) => {
    // @ts-expect-error Chrome global
    await chrome.storage.local.set({
      localBindings: ["http://localhost:8798", "http://127.0.0.1:8798"].map(
        (origin) => ({
          projectId,
          origin,
          identity: {
            title: "Fixture login",
            application: "Fixture app",
            site: "",
          },
        })
      ),
    })
  }, project.id)
  for (const origin of [fixture, "http://127.0.0.1:8798"]) {
    const page = await context.newPage()
    await page.goto(`${origin}/login`)
    await page.locator("#email").focus()
    await expect(
      page.getByRole("button", { name: /Shared multi-site login/ })
    ).toBeVisible()
    await page.getByRole("button", { name: /Shared multi-site login/ }).click()
    await expect(page.locator("#password")).toHaveValue("multi-secret")
    await page.close()
  }
  const page = await context.newPage()
  await page.goto(`${fixture}/login`)
  await page.locator("#email").fill("multi@example.com")
  await page.locator("#password").fill("changed-once")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  const prompt = page.getByRole("dialog", {
    name: "Update password in Global Login?",
  })
  await expect(prompt).toBeVisible()
  await prompt
    .getByRole("button", { name: "Update saved", exact: true })
    .click()
  await expect(
    page.getByText("Password updated", { exact: true })
  ).toBeVisible()
  await page.close()
  const sibling = await context.newPage()
  await sibling.goto("http://127.0.0.1:8798/login")
  await sibling.locator("#email").focus()
  await sibling.getByRole("button", { name: /Shared multi-site login/ }).click()
  await expect(sibling.locator("#password")).toHaveValue("changed-once")
  await sibling.goto("http://127.0.0.1:8798/unknown")
  await sibling.locator("#email").focus()
  await expect(
    sibling.getByRole("button", { name: /Shared multi-site login/ })
  ).toHaveCount(0)
  await sibling.close()
  const records = await savedAccounts()
  expect(records.filter((a) => a.id === account.id)).toHaveLength(1)
  const record = records.find((a) => a.id === account.id)!
  expect(record.websites).toHaveLength(2)
})

test("compact popup filters logins, updates details, copies and masks secrets without overflow", async () => {
  const project = await api("/projects", "POST", {
    name: "Second project",
    icon: "📚",
  })
  await api("/accounts", "POST", {
    project_id: project.id,
    label: "Second login",
    email: "second@example.com",
    password: "second-secret",
    login_type: "password",
    websites: [
      { url: "https://example.com" },
      { url: "https://beta.example.com" },
    ],
    notes: "A short note",
  })
  await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      api("/accounts", "POST", {
        project_id: "fixture-project",
        label: `Sample site ${index}`,
        email: `sample-${index}@example.test`,
        login_type: "google",
      })
    )
  )
  const ui = await popup()
  await ui.setViewportSize({ width: 620, height: 495 })
  await ui.locator(".vault-row").filter({ hasText: "Second login" }).click()
  await expect(
    ui.getByRole("heading", { name: "Second login", exact: true })
  ).toBeVisible()
  await expect(ui.locator(".login-details")).toContainText("A short note")
  await expect(ui.locator(".login-details")).toContainText(
    "https://beta.example.com"
  )
  await ui.screenshot({
    path: "test-results/extension-popup-dark.png",
    animations: "disabled",
  })
  const list = ui.locator(".login-scroll")
  const track = list.locator('[data-slot="scroll-area-scrollbar"]')
  const thumb = list.locator('[data-slot="scroll-area-thumb"]')
  const viewport = list.locator('[data-slot="scroll-area-viewport"]')
  await ui.getByLabel("Search logins").hover()
  await expect(track).toHaveCSS("opacity", "0")
  await list.hover()
  await expect(track).toHaveCSS("opacity", "1")
  await expect(track).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  const bounds = await thumb.boundingBox()
  expect(bounds).not.toBeNull()
  const x = bounds!.x + bounds!.width / 2
  const y = bounds!.y + bounds!.height / 2
  await ui.mouse.move(x, y)
  await ui.mouse.down()
  await ui.mouse.move(x, y + 55, { steps: 8 })
  await ui.mouse.up()
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
  await viewport.evaluate((element) => {
    element.scrollTop = 0
  })
  await ui.getByRole("button", { name: "Show password", exact: true }).click()
  await expect(ui.locator(".login-details")).toContainText("second-secret")
  await ui.getByRole("button", { name: "Hide password", exact: true }).click()
  await expect(ui.locator(".login-details")).not.toContainText("second-secret")
  const selectedRow = ui
    .locator(".vault-row")
    .filter({ hasText: "Second login" })
  await expect(selectedRow).toHaveCSS("box-shadow", "none")
  await selectedRow.hover()
  await expect(
    ui
      .getByRole("button", {
        name: "Open & Fill Second login (second@example.com)",
      })
      .locator("..")
  ).toHaveCSS("opacity", "1")
  const theme = ui.getByRole("button", { name: "Toggle light/dark theme" })
  await theme.click()
  await expect(ui.locator("html")).not.toHaveClass(/dark/)
  await theme.click()
  await expect(ui.locator("html")).toHaveClass(/dark/)
  const usernameRow = ui.getByRole("button", {
    name: "Copy username",
    exact: true,
  })
  const idleBackground = await usernameRow.evaluate(
    (row) => getComputedStyle(row).backgroundColor
  )
  await usernameRow.getByText("second@example.com", { exact: true }).hover()
  await expect
    .poll(() =>
      usernameRow.evaluate((row) => getComputedStyle(row).backgroundColor)
    )
    .not.toBe(idleBackground)
  await usernameRow.getByText("second@example.com", { exact: true }).click()
  await expect(ui.getByText("Username copied", { exact: true })).toBeVisible()
  await ui.getByRole("button", { name: "Copy password", exact: true }).click()
  await expect(ui.getByText("Password copied", { exact: true })).toBeVisible()
  await ui.getByLabel("Search logins").fill("beta.example.com")
  await expect(ui.locator(".vault-row")).toHaveCount(1)
  await ui.getByLabel("Search logins").fill("")
  await ui.getByRole("button", { name: "Project filter" }).click()
  await ui.getByRole("menuitem", { name: /Second project/ }).click()
  await expect(ui.locator(".vault-row")).toHaveCount(1)
  await ui.getByLabel("Search logins").click()
  expect(
    await ui
      .locator(".popup-shell")
      .evaluate((el) => el.scrollHeight <= el.clientHeight)
  ).toBe(true)
  expect(
    await ui.locator("body").evaluate((el) => el.scrollWidth <= el.clientWidth)
  ).toBe(true)
  await ui.getByRole("button", { name: "Settings menu" }).click()
  await ui.getByRole("menuitem", { name: "Settings", exact: true }).click()
  await ui.getByRole("combobox", { name: "Appearance" }).click()
  await ui.getByRole("option", { name: "Light", exact: true }).click()
  await ui.getByRole("button", { name: "Logins", exact: true }).click()
  await expect(ui.locator("html")).not.toHaveClass(/dark/)
  await ui.screenshot({
    path: "test-results/extension-popup-light.png",
    animations: "disabled",
  })
  await ui.close()
})

test("save prompt can create a separate login instead of updating an existing match", async () => {
  const page = await loginPage()
  await page.locator("#email").fill("login@example.com")
  await page.locator("#password").fill("separate-secret")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  const prompt = page.getByRole("dialog", {
    name: "Update password in Global Login?",
  })
  await expect(prompt.getByRole("radio")).toBeChecked()
  await prompt.getByRole("tab", { name: "New Login", exact: true }).click()
  await prompt.getByRole("button", { name: "Edit", exact: true }).click()
  await prompt.getByLabel("Account label").fill("Separate login")
  await prompt.getByRole("button", { name: "Save login", exact: true }).click()
  await expect(page.getByText("Login saved", { exact: true })).toBeVisible()
  const saved = await savedAccounts()
  expect(saved).toHaveLength(2)
  expect(saved.find((a) => a.label === "Separate login")?.email).toBe(
    "login@example.com"
  )
  expect(
    (await api("/accounts/fixture-account/password", "POST", {})).password
  ).toBe("fixture-password")
  await page.close()
})

test("Open and Fill opens the configured website and fills the selected login", async () => {
  await automatic(true)
  const ui = await popup()
  const opened = context.waitForEvent("page")
  const result = ui.evaluate(async () => {
    // @ts-expect-error Chrome global
    return chrome.runtime.sendMessage({
      type: "open-fill",
      accountId: "fixture-account",
      submit: false,
    })
  })
  const page = await opened
  expect((await result).ok).toBe(true)
  await expect(page.locator("#email")).toHaveValue("login@example.com")
  await expect(page.locator("#password")).toHaveValue("fixture-password")
  expect(await page.locator("body").getAttribute("data-count")).toBeNull()
  await page.close()
  await ui.close()
})

test("floating login fills a matching form on click and can be dismissed", async () => {
  const page = await context.newPage()
  await automatic(false)
  await page.goto(fixture + "/login")
  const prompt = page.getByRole("region", {
    name: "Global Login saved sign-in",
  })
  await expect(prompt).toBeVisible()
  await expect(page.locator("#password")).toHaveValue("")
  await prompt.getByRole("button", { name: "Dismiss floating login" }).click()
  await expect(prompt).toHaveCount(0)
  await page.reload()
  await prompt.getByRole("button", { name: "Fill login" }).click()
  await expect(page.locator("#email")).toHaveValue("login@example.com")
  await expect(prompt).toHaveCount(0)
  await page.close()
})

test("Other logins searches usernames and fills the keyboard selection", async () => {
  await api("/accounts", "POST", {
    project_id: "fixture-project",
    label: "Studio",
    email: "editor@example.test",
    password: crypto.randomUUID(),
    login_type: "password",
    websites: [{ url: fixture }],
  })
  const page = await context.newPage()
  await page.goto(fixture + "/login")
  const other = page.getByRole("button", { name: /Other logins/ })
  await other.click()
  const search = page.getByRole("combobox", { name: "Find a saved login" })
  await expect(search).toBeFocused()
  await expect(page.getByRole("option")).toHaveCount(2)
  await search.press("ArrowDown")
  await expect(page.getByRole("option").nth(1)).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await search.press("Escape")
  await expect(other).toBeFocused()
  await other.click()
  await search.fill("editor@")
  await expect(page.getByRole("option")).toHaveCount(1)
  await search.press("Enter")
  await expect(page.locator("#email")).toHaveValue("editor@example.test")
  await page.close()
})
