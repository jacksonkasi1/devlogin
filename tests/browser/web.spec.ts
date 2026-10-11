import { test, expect } from "@playwright/test"

const backend = "http://localhost:8799"
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
  await expect(page.getByRole("dialog")).toBeHidden()
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
  await expect(page.getByRole("dialog")).toBeHidden()
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
  await expect(page.getByRole("dialog")).toBeHidden()
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
  await expect(page.getByRole("dialog")).toBeHidden()
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
