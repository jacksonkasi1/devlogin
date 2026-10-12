import { test, expect } from "@playwright/test"

const backend = "http://localhost:8799"

test("missing Google favicon falls back to the icon declared by the website", async ({
  page,
}) => {
  await page.route(
    "https://www.google.com/s2/favicons?domain=sandbox.vizfleet.com&sz=64",
    (route) => route.fulfill({ status: 404 })
  )
  await page.route(
    "https://devlogin.peacockindia.in/api/favicon?url=https%3A%2F%2Fsandbox.vizfleet.com",
    (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>',
      })
  )
  await page.goto(backend)
  await page.getByRole("button", { name: "Fixture app 1" }).click()
  await page.getByRole("button", { name: "Add Login", exact: true }).click()
  await page
    .getByLabel("Website URL 1", { exact: true })
    .fill("https://sandbox.vizfleet.com/dashboard/login")
  const preview = page.getByRole("button", { name: "Change icon preview" })
  await expect(preview.locator("img")).toHaveAttribute("src", /\/api\/favicon/)
  await expect
    .poll(() =>
      preview
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth)
    )
    .toBe(64)
})

test("website favicon defaults on web creation and persists after clearing an emoji", async ({
  page,
  request,
}) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>'
  await page.route("https://favicon.example.com/favicon.ico", (route) =>
    route.fulfill({ status: 404 })
  )
  await page.route(
    "https://www.google.com/s2/favicons?domain=favicon.example.com&sz=64",
    (route) => route.fulfill({ contentType: "image/svg+xml", body: svg })
  )
  await page.goto(backend)
  await page.getByRole("button", { name: "Fixture app 1" }).click()
  await page.getByRole("button", { name: "Add Login", exact: true }).click()
  await page.getByLabel("Title", { exact: true }).fill("Favicon login")
  await page
    .getByLabel("Username / Email", { exact: true })
    .fill("favicon@example.com")
  await page.getByLabel("Password", { exact: true }).fill("favicon-secret")
  const website = page.getByLabel("Website URL 1", { exact: true })
  await website.fill("https://")
  await expect(website).toBeVisible()
  await website.fill("https://favicon.example.com/login")
  const preview = page.getByRole("button", { name: "Change icon preview" })
  await expect(preview.locator("img")).toHaveAttribute(
    "src",
    /google\.com\/s2\/favicons/
  )
  await expect
    .poll(() =>
      preview
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth)
    )
    .toBe(32)
  await page.getByRole("button", { name: "Save Login", exact: true }).click()
  const details = page.getByRole("region", { name: "Account details" })
  await expect(details.locator("img")).toHaveAttribute(
    "src",
    /google\.com\/s2\/favicons/
  )
  await details.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("button", { name: "Change Icon", exact: true }).click()
  await page.getByRole("button", { name: "Use 🚀 icon", exact: true }).click()
  await expect(preview).toHaveText("🚀")
  await expect(preview.locator("img")).toHaveCount(0)
  await page.getByRole("button", { name: "Save Login", exact: true }).click()
  await details.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(preview).toHaveText("🚀")
  await page.getByRole("button", { name: "Change Icon", exact: true }).click()
  await page
    .getByRole("button", { name: "Use website favicon", exact: true })
    .click()
  await expect(preview.locator("img")).toHaveAttribute("src", /favicons/)
  await page.getByRole("button", { name: "Save Login", exact: true }).click()
  await page.reload()
  await page.getByRole("button", { name: "Fixture app 2" }).click()
  await page
    .getByRole("region", { name: "Accounts", exact: true })
    .getByRole("button", { name: /Favicon login/ })
    .click()
  await details.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(preview.locator("img")).toHaveAttribute("src", /favicons/)
  const { token } = await (await request.get(`${backend}/fixture/token`)).json()
  const accounts = await (
    await request.get(`${backend}/api/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  expect(
    accounts.find(
      (account: { label: string }) => account.label === "Favicon login"
    ).icon
  ).toBe("")
})
test.beforeEach(async ({ context, request }) => {
  await request.get(`${backend}/fixture/reset`)
  const { token } = await (await request.get(`${backend}/fixture/token`)).json()
  await context.addCookies([
    { name: "devlogin_session", value: token, url: backend },
  ])
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: backend,
  })
})

test("projects filter immediately; secrets, search and detail selection stay in the workspace", async ({
  page,
  request,
}) => {
  const { token } = await (await request.get(`${backend}/fixture/token`)).json()
  const project = await (
    await request.post(`${backend}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Second project",
        urls: ["https://second.example.com"],
        login_path: "/login",
      },
    })
  ).json()
  await request.post(`${backend}/api/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      project_id: project.id,
      label: "Second login",
      email: "second@example.com",
      password: "second-secret",
      login_type: "password",
    },
  })
  await page.goto(backend)
  const accounts = page.getByRole("region", { name: "Accounts", exact: true })
  const details = page.getByRole("region", { name: "Account details" })
  await expect(
    details.getByText("Select an account", { exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Fixture app 1" }).click()
  await expect(
    accounts.getByRole("button", { name: /Fixture account/ })
  ).toBeVisible()
  await expect(
    accounts.getByRole("button", { name: /Second login/ })
  ).toHaveCount(0)
  await accounts.getByRole("button", { name: /Fixture account/ }).click()
  await expect(details.getByLabel("Password", { exact: true })).toHaveText(
    "••••••••••••"
  )
  await page.getByRole("button", { name: "Show password", exact: true }).click()
  await expect(details.getByLabel("Password", { exact: true })).toHaveText(
    "fixture-password"
  )
  await page.getByRole("button", { name: "Copy password", exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("fixture-password")
  await page.getByRole("button", { name: "Hide password", exact: true }).click()
  await expect(details.getByLabel("Password", { exact: true })).toHaveText(
    "••••••••••••"
  )
  await page.getByRole("button", { name: "Copy username", exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("login@example.com")
  await expect(details.getByRole("link")).toHaveAttribute(
    "href",
    "http://localhost:8798/login"
  )
  await page.getByRole("button", { name: /All Logins/ }).click()
  await page.getByLabel("Search logins").fill("second@example.com")
  await expect(
    accounts.getByRole("button", { name: /Second login/ })
  ).toBeVisible()
  await expect(
    accounts.getByRole("button", { name: /Fixture account/ })
  ).toHaveCount(0)
  await accounts.getByRole("button", { name: /Second login/ }).click()
  await expect(
    details.getByRole("heading", { name: "Second login" })
  ).toBeVisible()
  await page.screenshot({ path: "test-results/devlogin-desktop.png" })
  await page.getByLabel("Search logins").fill("no such account")
  await expect(
    accounts.getByText("No matching logins", { exact: true })
  ).toBeVisible()
  await expect(
    details.getByText("Select an account", { exact: true })
  ).toBeVisible()
  await expect(page).toHaveURL(backend + "/")
})

test("add, edit and confirmed delete update the selected login and shared API", async ({
  page,
  request,
}) => {
  await page.goto(backend)
  await page.getByRole("button", { name: "Add Login", exact: true }).click()
  await page.getByLabel("Title", { exact: true }).fill("New developer")
  await page
    .getByLabel("Username / Email", { exact: true })
    .fill("new@example.com")
  await page.getByLabel("Password", { exact: true }).fill("new-password")
  await page.getByRole("button", { name: "Save Login" }).click()
  const details = page.getByRole("region", { name: "Account details" })
  await expect(
    details.getByRole("heading", { name: "New developer" })
  ).toBeVisible()
  await details.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByLabel("Title", { exact: true }).fill("Edited developer")
  await page
    .getByLabel("Username / Email", { exact: true })
    .fill("edited@example.com")
  await page.getByRole("button", { name: "Save Login" }).click()
  await expect(
    details.getByRole("heading", { name: "Edited developer" })
  ).toBeVisible()
  await expect(
    details.getByText("edited@example.com", { exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Show password", exact: true }).click()
  await expect(details.getByLabel("Password", { exact: true })).toHaveText(
    "new-password"
  )
  await page.getByRole("button", { name: "Login actions" }).click()
  await page.getByRole("menuitem", { name: "Delete login" }).click()
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(
    details.getByRole("heading", { name: "Edited developer" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Login actions" }).click()
  await page.getByRole("menuitem", { name: "Delete login" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: /Edited developer/ })
  ).toHaveCount(0)
  await expect(
    details.getByText("Select an account", { exact: true })
  ).toBeVisible()
  const { token } = await (await request.get(`${backend}/fixture/token`)).json()
  const sync = await (
    await request.get(`${backend}/api/sync`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  expect(sync.accounts).toHaveLength(1)
})

test("project dialogs create, rename and delete without navigating", async ({
  page,
}) => {
  await page.goto(backend)
  await page.getByRole("button", { name: "Add Project", exact: true }).click()
  await page.getByLabel("Project name", { exact: true }).fill("New project")
  await page
    .getByRole("button", { name: /Create Project|Save Project/ })
    .click()
  await expect(
    page.getByRole("button", { name: "New project 0" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Project actions" }).click()
  await page.getByRole("menuitem", { name: "Edit project" }).click()
  await page.getByLabel("Project name", { exact: true }).fill("Renamed project")
  await page
    .getByRole("button", { name: /Create Project|Save Project/ })
    .click()
  await expect(
    page.getByRole("button", { name: "Renamed project 0" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Project actions" }).click()
  await page.getByRole("menuitem", { name: "Delete project" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Renamed project 0" })
  ).toHaveCount(0)
  await expect(page).toHaveURL(backend + "/")
})

test("mobile drill-down, back navigation and dark theme", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(backend)
  await expect(
    page.getByRole("complementary", { name: "Projects" })
  ).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Accounts", exact: true })
  ).toBeHidden()
  await page.getByRole("button", { name: "Fixture app 1" }).click()
  await page.getByRole("button", { name: /Fixture account/ }).click()
  await expect(
    page.getByRole("region", { name: "Account details" })
  ).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Accounts", exact: true })
  ).toBeHidden()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.screenshot({ path: "test-results/devlogin-mobile.png" })
  await page.getByRole("button", { name: "Back to accounts" }).click()
  await page.getByRole("button", { name: "Back to projects" }).click()
  await expect(
    page.getByRole("complementary", { name: "Projects" })
  ).toBeVisible()
  await page.getByRole("button", { name: "Profile menu" }).click()
  await page.getByRole("menuitem", { name: "Settings" }).click()
  await page.getByRole("button", { name: "Dark", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "Toggle light/dark theme" }).click()
  await expect(page.locator("html")).toHaveClass(/light/)
  await page.getByRole("button", { name: "Toggle light/dark theme" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "DevLogin logins" }).click()
  await expect(
    page.getByRole("complementary", { name: "Projects" })
  ).toBeVisible()
})

test("members retain read access; pending users cannot view credentials", async ({
  page,
  request,
}) => {
  await request.get(`${backend}/fixture/member`)
  await page.goto(backend)
  await expect(
    page.getByRole("button", { name: "Add Login", exact: true })
  ).toHaveCount(0)
  await page.getByRole("button", { name: /Fixture account/ }).click()
  await expect(
    page.getByRole("button", { name: /Fixture account/ })
  ).toHaveAttribute("draggable", "false")
  await expect(
    page.getByRole("button", { name: "Copy password", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Edit", exact: true })
  ).toHaveCount(0)
  await request.get(`${backend}/fixture/approval?approved=false`)
  await page.reload()
  await expect(
    page.getByText("Waiting for Approval", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Accounts", exact: true })
  ).toHaveCount(0)
})

test("dragging a login to a project preserves credentials and handles rejected moves", async ({
  page,
  request,
}) => {
  const { token } = await (await request.get(`${backend}/fixture/token`)).json()
  const headers = { Authorization: `Bearer ${token}` }
  const target = await (
    await request.post(`${backend}/api/projects`, {
      headers,
      data: { name: "Drop target" },
    })
  ).json()
  const original = (
    await (await request.get(`${backend}/api/accounts`, { headers })).json()
  )[0]
  const metadata = {
    ...original,
    icon: "🚀",
    notes: "Keep this note",
    websites: [
      { url: "https://example.com/" },
      { url: "https://beta.example.com/" },
    ],
  }
  expect(
    (
      await request.put(`${backend}/api/accounts/${original.id}`, {
        headers,
        data: metadata,
      })
    ).ok()
  ).toBeTruthy()
  await page.goto(backend)
  const sidebar = page.getByRole("complementary", { name: "Projects" })
  await sidebar
    .getByRole("button", { name: "Fixture app 1", exact: true })
    .click()
  const row = page
    .getByRole("region", { name: "Accounts", exact: true })
    .getByRole("button", { name: /Fixture account/ })
  await expect(row).toHaveAttribute("draggable", "true")
  let moves = 0
  page.on("request", (req) => {
    if (
      req.method() === "PUT" &&
      req.url().endsWith(`/api/accounts/${original.id}`)
    )
      moves++
  })
  await row.dragTo(
    sidebar.getByRole("button", { name: "Fixture app 1", exact: true })
  )
  expect(moves).toBe(0)
  await page.route(
    `**/api/accounts/${original.id}`,
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Move failed" }),
      }),
    { times: 1 }
  )
  await row.dragTo(
    sidebar.getByRole("button", { name: "Drop target 0", exact: true })
  )
  await expect(page.getByText("Move failed", { exact: true })).toBeVisible()
  await expect(
    sidebar.getByRole("button", { name: "Fixture app 1", exact: true })
  ).toBeVisible()
  await expect(row).toBeVisible()
  await row.dragTo(
    sidebar.getByRole("button", { name: "Drop target 0", exact: true })
  )
  await expect(
    sidebar.getByRole("button", { name: "Drop target 1", exact: true })
  ).toHaveAttribute("aria-current", "true")
  await expect(
    sidebar.getByRole("button", { name: "Fixture app 0", exact: true })
  ).toBeVisible()
  const details = page.getByRole("region", { name: "Account details" })
  await expect(
    details.getByRole("heading", { name: "Fixture account" })
  ).toBeVisible()
  await expect(
    details.getByText("Keep this note", { exact: true })
  ).toBeVisible()
  const saved = (
    await (await request.get(`${backend}/api/accounts`, { headers })).json()
  )[0]
  expect(saved).toMatchObject({
    id: original.id,
    project_id: target.id,
    icon: metadata.icon,
    notes: metadata.notes,
    websites: metadata.websites,
  })
  const secret = await (
    await request.post(`${backend}/api/accounts/${original.id}/password`, {
      headers,
      data: {},
    })
  ).json()
  expect(secret.password).toBe("fixture-password")
  expect(moves).toBe(2)
})

test("expanded emoji picker searches, filters categories and accepts pasted emoji", async ({
  page,
}) => {
  await page.goto(backend)
  await page.getByRole("button", { name: "Add Project", exact: true }).click()
  await page.getByRole("button", { name: "Change Icon", exact: true }).click()
  await page.getByRole("button", { name: "More emojis", exact: true }).click()
  const search = page.getByRole("textbox", {
    name: "Search emojis or paste one",
  })
  await search.pressSequentially("fire engine")
  await expect(
    page.getByRole("button", { name: "Use fire engine emoji", exact: true })
  ).toBeVisible()
  await search.fill("india")
  await expect(
    page.getByRole("button", { name: "Use flag: India emoji", exact: true })
  ).toBeVisible()
  await search.fill("")
  await page.getByRole("combobox", { name: "Emoji category" }).click()
  await page.getByRole("option", { name: "Flags", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Use chequered flag emoji", exact: true })
  ).toBeVisible()
  await page.screenshot({ path: "test-results/devlogin-emoji-picker.png" })
  await search.press("Escape")
  await expect(page.getByRole("dialog", { name: "Choose icon" })).toBeHidden()
  await page.getByRole("button", { name: "Change icon preview" }).click()
  await search.fill("🧑🏽‍🚀")
  await page.getByRole("button", { name: "Use 🧑🏽‍🚀", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: /^(Add|Edit|Delete) /i })
  await expect(dialog.getByText("🧑🏽‍🚀", { exact: true })).toBeVisible()
  await page.getByLabel("Project name", { exact: true }).fill("Astronaut")
  await page
    .getByRole("button", { name: "Create Project", exact: true })
    .click()
  await expect(dialog).toBeHidden()
  await expect(
    page
      .getByRole("complementary", { name: "Projects" })
      .getByText("🧑🏽‍🚀", { exact: true })
  ).toBeVisible()
})
test("login editor manages websites, notes, icons and project assignment", async ({
  page,
  request,
}) => {
  await page.goto(backend)
  await page.getByRole("button", { name: "Add Project", exact: true }).click()
  await page.getByRole("button", { name: "Change Icon", exact: true }).click()
  await page.getByRole("button", { name: "Use 🚀 icon", exact: true }).click()
  await page.getByLabel("Project name", { exact: true }).fill("Launch")
  await page
    .getByRole("button", { name: "Create Project", exact: true })
    .click()
  await expect(
    page.getByRole("dialog", { name: /^(Add|Edit|Delete) /i })
  ).toBeHidden()
  await page.getByRole("button", { name: "Add Login", exact: true }).click()
  await page.getByLabel("Title", { exact: true }).fill("Shared admin")
  await page
    .getByLabel("Username / Email", { exact: true })
    .fill("admin@example.com")
  await page.getByLabel("Password", { exact: true }).fill("shared-password")
  await page
    .getByLabel("Website URL 1", { exact: true })
    .fill("https://sandbox.example.com/login?tracking=1")
  await page.getByRole("button", { name: "Add another website" }).click()
  await page
    .getByLabel("Website URL 2", { exact: true })
    .fill("https://beta.example.com")
  await page
    .getByLabel("Notes", { exact: false })
    .fill("Shared across environments")
  await page.getByRole("button", { name: "Save Login", exact: true }).click()
  await expect(
    page.getByRole("dialog", { name: /^(Add|Edit|Delete) /i })
  ).toBeHidden()
  const details = page.getByRole("region", { name: "Account details" })
  await expect(
    details.getByRole("heading", { name: "Shared admin" })
  ).toBeVisible()
  await expect(details.getByRole("link")).toHaveCount(2)
  await expect(details.getByRole("link").first()).toHaveAttribute(
    "href",
    "https://sandbox.example.com/login"
  )
  await expect(
    details.getByText("Shared across environments", { exact: true })
  ).toBeVisible()
  await details.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("button", { name: "Change Icon", exact: true }).click()
  await page.getByRole("button", { name: "Use 🔑 icon", exact: true }).click()
  await page.getByRole("button", { name: "Add another website" }).click()
  await page
    .getByLabel("Website URL 3", { exact: true })
    .fill("http://localhost:3000")
  await page.getByLabel("Notes", { exact: false }).fill("Updated note")
  await page.getByRole("combobox", { name: "Project", exact: true }).click()
  await page.getByRole("option", { name: "Fixture app", exact: false }).click()
  await page.getByRole("button", { name: "Save Login", exact: true }).click()
  await expect(
    page.getByRole("dialog", { name: /^(Add|Edit|Delete) /i })
  ).toBeHidden()
  await expect(details.getByRole("link")).toHaveCount(3)
  await expect(details.getByText("Updated note", { exact: true })).toBeVisible()
  await expect(
    details.getByRole("heading", { name: "Shared admin" })
  ).toBeVisible()
  await details.getByRole("button", { name: "Edit", exact: true }).click()
  await page
    .getByRole("button", { name: "Remove website 2", exact: true })
    .click()
  await page.getByRole("button", { name: "Save Login", exact: true }).click()
  await expect(
    page.getByRole("dialog", { name: /^(Add|Edit|Delete) /i })
  ).toBeHidden()
  await expect(details.getByRole("link")).toHaveCount(2)
  const { token } = await (await request.get(`${backend}/fixture/token`)).json()
  const accounts = await (
    await request.get(`${backend}/api/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  const login = accounts.find(
    (a: { label: string }) => a.label === "Shared admin"
  )
  expect(login.icon).toBe("🔑")
  expect(login.websites).toHaveLength(2)
  expect(login.project_id).toBe("fixture-project")
  await page.screenshot({ path: "test-results/devlogin-folders-logins.png" })
})
