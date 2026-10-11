import { afterEach, beforeEach, expect, test } from "bun:test"
import app from "../apps/worker/src/index"
import { hash } from "../apps/worker/src/crypto"
import { testDatabase } from "./d1"
import type { AppEnv } from "../apps/worker/src/auth"
import type { Account, Project, Sync } from "@workspace/shared"

let db: ReturnType<typeof testDatabase>
let env: AppEnv["Bindings"]
beforeEach(async () => {
  db = testDatabase()
  env = {
    DB: db.binding,
    ASSETS: { fetch: () => new Response("assets") },
    APP_ORIGIN: "http://localhost:8787",
    EXTENSION_IDS: "",
    CREDENTIAL_KEY: btoa("k".repeat(32)),
  } as unknown as AppEnv["Bindings"]
  for (const [id, admin] of [
    ["admin", 1],
    ["member", 0],
  ] as const) {
    db.sqlite
      .query(
        "INSERT INTO users (id,google_id,email,name,approved,is_admin,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?)"
      )
      .run(id, id, `${id}@example.com`, id, admin, "now", "now")
    db.sqlite
      .query("INSERT INTO sessions VALUES (?,?,?)")
      .run(await hash(id), id, Date.now() + 60_000)
  }
})
afterEach(() => db.sqlite.close())
function request(path: string, method = "GET", body?: unknown, role = "admin") {
  return app.request(
    `http://localhost:8787/api${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${role}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    env
  )
}
async function project(name = "Test") {
  const response = await request("/projects", "POST", {
    name,
    urls: ["http://localhost:3000", "https://staging.example.com"],
    login_path: "/login",
  })
  expect(response.status).toBe(201)
  return (await response.json()) as Project
}
async function account(projectId: string, overrides = {}) {
  const response = await request("/accounts", "POST", {
    project_id: projectId,
    label: "Admin",
    email: "admin@example.com",
    password: "a-secret-password",
    login_type: "password",
    is_default: true,
    ...overrides,
  })
  expect(response.status).toBe(201)
  return (await response.json()) as Account
}
test("accounts support usernames and exact project environments; regular users cannot mutate", async () => {
  const p = await project()
  const a = await account(p.id, {
    email: "developer",
    environment: "https://staging.example.com",
  })
  expect(a.environment).toBe("https://staging.example.com")
  expect(
    (
      await request(`/accounts/${a.id}`, "PUT", {
        ...a,
        environment: "https://other.example.com",
        websites: undefined,
      })
    ).status
  ).toBe(400)
  expect(
    (
      await request(
        `/accounts/${a.id}`,
        "PUT",
        { ...a, password: "new-password" },
        "member"
      )
    ).status
  ).toBe(403)
  expect(
    (
      await request(
        "/accounts",
        "POST",
        { ...a, password: "new-password" },
        "member"
      )
    ).status
  ).toBe(403)
})
test("passwords are encrypted in D1; metadata and sync never contain password or ciphertext", async () => {
  const p = await project()
  const a = await account(p.id)
  const stored = db.sqlite
    .query("SELECT encrypted_password FROM accounts")
    .get() as { encrypted_password: string }
  expect(stored.encrypted_password).toStartWith("v1.")
  expect(stored.encrypted_password).not.toContain("a-secret-password")
  for (const path of ["/accounts", "/sync"]) {
    const body = await (await request(path)).text()
    expect(body).not.toContain("a-secret-password")
    expect(body).not.toContain("encrypted_password")
    expect(body).not.toContain(stored.encrypted_password)
  }
  const password = await request(
    `/accounts/${a.id}/password`,
    "POST",
    {},
    "member"
  )
  expect(await password.json()).toEqual({ password: "a-secret-password" })
  expect(password.headers.get("Cache-Control")).toBe("no-store")
})
test("members can use accounts and preferences but cannot edit shared records or users", async () => {
  const p = await project()
  const a = await account(p.id)
  for (const [path, method, body] of [
    [`/projects/${p.id}`, "DELETE", {}],
    [`/accounts/${a.id}`, "DELETE", {}],
    ["/projects", "POST", {}],
    ["/accounts", "POST", {}],
    ["/users/admin", "PATCH", { approved: false }],
  ] as const)
    expect((await request(path, method, body, "member")).status).toBe(403)
  expect((await request("/users", "GET", undefined, "member")).status).toBe(403)
  expect(
    (
      await request(
        "/preferences",
        "PUT",
        { project_id: p.id, account_id: a.id, auto_login: true },
        "member"
      )
    ).status
  ).toBe(200)
  const preferences = await (
    await request("/preferences", "GET", undefined, "member")
  ).json()
  expect(preferences).toEqual([
    { project_id: p.id, account_id: a.id, auto_login: true },
  ])
  expect(await (await request("/preferences")).json()).toEqual([])
})
test("editing a password and clearing previous default are transactional", async () => {
  const p = await project()
  const first = await account(p.id)
  const second = await account(p.id, { label: "Second" })
  const rows = (await (await request("/accounts")).json()) as Account[]
  expect(rows.find((row) => row.id === first.id)?.is_default).toBe(false)
  expect(rows.find((row) => row.id === second.id)?.is_default).toBe(true)
  await request(`/accounts/${second.id}`, "PUT", {
    ...second,
    password: "updated-password",
  })
  expect(
    await (await request(`/accounts/${second.id}/password`, "POST", {})).json()
  ).toEqual({ password: "updated-password" })
  await request(`/accounts/${second.id}`, "PUT", {
    ...second,
    label: "Renamed",
  })
  expect(
    await (await request(`/accounts/${second.id}/password`, "POST", {})).json()
  ).toEqual({ password: "updated-password" })
})
test("deletions sync correctly and cascade preferences and accounts", async () => {
  const p = await project()
  const a = await account(p.id)
  await request("/preferences", "PUT", {
    project_id: p.id,
    account_id: a.id,
    auto_login: true,
  })
  const before = (await (await request("/sync")).json()) as Sync
  await request(`/accounts/${a.id}`, "DELETE", {})
  const after = (await (await request("/sync")).json()) as Sync
  expect(after.revision).not.toBe(before.revision)
  expect(after.accounts).toEqual([])
  expect(after.preferences[0]?.account_id).toBeNull()
  expect(after.preferences[0]?.auto_login).toBe(false)
  await account(p.id)
  await request(`/projects/${p.id}`, "DELETE", {})
  const deleted = (await (await request("/sync")).json()) as Sync
  expect(deleted.projects).toEqual([])
  expect(deleted.accounts).toEqual([])
  expect(deleted.preferences).toEqual([])
})
test("rejects unsafe URLs, wrong-project preferences and missing records", async () => {
  for (const url of [
    "javascript:alert(1)",
    "http://staging.example.com",
    "https://user:pass@example.com",
    "https://example.com?x=1",
  ])
    expect(
      (await request("/projects", "POST", { name: "Unsafe", urls: [url] }))
        .status
    ).toBe(400)
  const p = await project()
  const other = await project("Other")
  const a = await account(p.id)
  expect(
    (
      await request("/preferences", "PUT", {
        project_id: other.id,
        account_id: a.id,
        auto_login: true,
      })
    ).status
  ).toBe(400)
  expect(
    (
      await request("/accounts", "POST", {
        project_id: p.id,
        label: "Empty",
        email: "a@example.com",
        login_type: "password",
      })
    ).status
  ).toBe(400)
  expect((await request("/accounts/unknown/password", "POST", {})).status).toBe(
    404
  )
  expect(
    (await request("/users/admin", "PATCH", { approved: false })).status
  ).toBe(400)
})
test("folders and multi-site logins preserve one credential when edited and moved", async () => {
  const folder = (await (
    await request("/projects", "POST", { name: "Folder", icon: "🚀" })
  ).json()) as Project
  expect(folder.urls).toEqual([])
  expect(folder.icon).toBe("🚀")
  const a = await account(folder.id, {
    icon: "🔑",
    notes: "Shared admin",
    websites: [
      { url: "https://sandbox.example.com/login?tracking=1#form" },
      { url: "https://beta.example.com" },
      { url: "http://localhost:3000" },
    ],
  })
  expect(a.websites?.[0]?.url).toBe("https://sandbox.example.com/login")
  expect(a.websites).toHaveLength(3)
  const before = db.sqlite
    .query("SELECT encrypted_password FROM accounts WHERE id = ?")
    .get(a.id) as { encrypted_password: string }
  await request("/preferences", "PUT", {
    project_id: folder.id,
    account_id: a.id,
    auto_login: true,
  })
  const target = (await (
    await request("/projects", "POST", { name: "Target" })
  ).json()) as Project
  await account(target.id, {
    label: "Existing default",
    websites: [{ url: "https://other.example.com" }],
  })
  const response = await request(`/accounts/${a.id}`, "PUT", {
    ...a,
    project_id: target.id,
    notes: "Moved",
    websites: [...a.websites!, { url: "https://third.example.com/app" }],
  })
  expect(response.status).toBe(200)
  const moved = (await response.json()) as Account
  expect(moved.id).toBe(a.id)
  expect(moved.websites).toHaveLength(4)
  expect(moved.notes).toBe("Moved")
  expect(moved.project_id).toBe(target.id)
  const after = db.sqlite
    .query("SELECT encrypted_password FROM accounts WHERE id = ?")
    .get(a.id) as { encrypted_password: string }
  expect(after).toEqual(before)
  const sync = (await (await request("/sync")).json()) as Sync
  expect(sync.preferences[0]?.account_id).toBeNull()
  expect(sync.preferences[0]?.auto_login).toBe(false)
  expect(
    sync.accounts.filter((a) => a.project_id === target.id && a.is_default)
  ).toHaveLength(1)
  await request(`/accounts/${a.id}`, "PUT", {
    ...moved,
    password: "updated-for-all-sites",
  })
  expect(
    await (await request(`/accounts/${a.id}/password`, "POST", {})).json()
  ).toEqual({ password: "updated-for-all-sites" })
  expect(
    ((await (await request("/accounts")).json()) as Account[]).filter(
      (item) => item.id === a.id
    )
  ).toHaveLength(1)
})
