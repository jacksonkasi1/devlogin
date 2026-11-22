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
  for (const [id, admin, edit] of [
    ["admin", 1, 1],
    ["member", 0, 1],
    ["viewer", 0, 0],
  ] as const) {
    db.sqlite
      .query(
        "INSERT INTO users (id,google_id,email,name,approved,is_admin,can_edit,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?,?)"
      )
      .run(id, id, `${id}@example.com`, id, admin, edit, "now", "now")
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
test("accounts support usernames and exact project environments; view-only users cannot mutate", async () => {
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
        "viewer"
      )
    ).status
  ).toBe(403)
  expect(
    (
      await request(
        "/accounts",
        "POST",
        { ...a, password: "new-password" },
        "viewer"
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
test("view-only users can use accounts and preferences but cannot edit shared records or users", async () => {
  const p = await project()
  const a = await account(p.id)
  for (const [path, method, body] of [
    [`/projects/${p.id}`, "DELETE", {}],
    [`/accounts/${a.id}`, "DELETE", {}],
    ["/projects", "POST", {}],
    ["/accounts", "POST", {}],
  ] as const)
    expect((await request(path, method, body, "viewer")).status).toBe(403)
  for (const role of ["member", "viewer"])
    expect(
      (await request("/users/admin", "PATCH", { approved: false }, role)).status
    ).toBe(403)
  expect((await request("/users", "GET", undefined, "member")).status).toBe(403)
  expect(
    (
      await request(
        "/preferences",
        "PUT",
        { project_id: p.id, account_id: a.id, auto_login: true },
        "viewer"
      )
    ).status
  ).toBe(200)
  const preferences = await (
    await request("/preferences", "GET", undefined, "viewer")
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

test("regular users can add, change and remove logins by default", async () => {
  const created = await request(
    "/projects",
    "POST",
    { name: "Member project", urls: ["https://m.example.com"] },
    "member"
  )
  expect(created.status).toBe(201)
  const p = (await created.json()) as Project
  const made = await request(
    "/accounts",
    "POST",
    {
      project_id: p.id,
      label: "Mine",
      email: "me",
      password: crypto.randomUUID(),
      login_type: "password",
    },
    "member"
  )
  expect(made.status).toBe(201)
  const a = (await made.json()) as Account
  expect(
    (
      await request(
        `/accounts/${a.id}`,
        "PUT",
        { ...a, password: crypto.randomUUID() },
        "member"
      )
    ).status
  ).toBe(200)
  expect(
    (await request(`/accounts/${a.id}`, "DELETE", {}, "member")).status
  ).toBe(200)
  expect(
    (await request(`/projects/${p.id}`, "DELETE", {}, "member")).status
  ).toBe(200)
})
test("admins control edit and backup access and cannot demote themselves", async () => {
  const patch = (id: string, body: unknown) =>
    request(`/users/${id}`, "PATCH", body)
  expect((await patch("member", { can_edit: false })).status).toBe(200)
  expect(
    (await request("/projects", "POST", { name: "x" }, "member")).status
  ).toBe(403)
  expect(
    (await patch("member", { can_edit: true, can_backup: false })).status
  ).toBe(200)
  expect((await request("/backup", "GET", undefined, "member")).status).toBe(
    403
  )
  expect((await patch("admin", { is_admin: false })).status).toBe(400)
  expect((await patch("member", {})).status).toBe(400)
})
test("backup exports decrypted data and imports it back without deleting", async () => {
  const p = await project("Backup me")
  const a = await account(p.id)
  const exported = await (
    await request("/backup", "GET", undefined, "member")
  ).json()
  expect(exported.accounts[0].password).toBe("a-secret-password")
  expect((await request(`/accounts/${a.id}`, "DELETE")).status).toBe(200)
  const extra = await project("Untouched")
  const restored = await request("/backup/import", "POST", exported, "member")
  expect(restored.status).toBe(200)
  const rows = (await (await request("/accounts")).json()) as Account[]
  expect(rows.map((row) => row.id)).toEqual([a.id])
  expect(
    await (await request(`/accounts/${a.id}/password`, "POST", {})).json()
  ).toEqual({ password: "a-secret-password" })
  const list = (await (await request("/projects")).json()) as Project[]
  expect(list.map((item) => item.id)).toContain(extra.id)
  expect(
    (
      await request("/backup/import", "POST", {
        projects: [],
        accounts: [{ ...exported.accounts[0], project_id: "nope" }],
      })
    ).status
  ).toBe(400)
})
async function mcp(
  token: string,
  method: string,
  params?: unknown,
  id: number | null = 1
) {
  return app.request(
    "http://localhost:8787/api/mcp",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(id === null ? {} : { id }),
        method,
        params,
      }),
    },
    env
  )
}
async function mcpToken(role: string) {
  const response = await request("/mcp/token", "POST", {}, role)
  expect(response.status).toBe(200)
  const { token } = (await response.json()) as { token: string }
  expect(token).toStartWith("dlm_")
  return token
}
const call = async (token: string, name: string, args: unknown = {}) => {
  const body = await (
    await mcp(token, "tools/call", { name, arguments: args })
  ).json()
  return {
    error: body.result.isError as boolean | undefined,
    value: body.result.isError
      ? (body.result.content[0].text as string)
      : JSON.parse(body.result.content[0].text),
  }
}
test("MCP tokens are stable until reset, and unknown tokens are rejected", async () => {
  const first = await mcpToken("member")
  expect(await mcpToken("member")).toBe(first)
  const reset = await (
    await request("/mcp/token/reset", "POST", {}, "member")
  ).json()
  expect(reset.token).not.toBe(first)
  expect((await mcp(first, "ping")).status).toBe(401)
  expect((await mcp(reset.token, "ping")).status).toBe(200)
  expect((await mcp("dlm_bogus", "ping")).status).toBe(401)
  // An MCP token cannot mint or read tokens.
  expect((await request("/mcp/token", "POST", {}, reset.token)).status).toBe(
    403
  )
  const stored = db.sqlite.query("SELECT * FROM mcp_tokens").all()
  expect(JSON.stringify(stored)).not.toContain(reset.token)
  expect(await (await request("/users")).text()).not.toContain("dlm_")
})
test("MCP initializes, lists tools and manages logins as its owner", async () => {
  const token = await mcpToken("member")
  const init = await (
    await mcp(token, "initialize", { protocolVersion: "2025-06-18" })
  ).json()
  expect(init.result.serverInfo.name).toBe("devlogin")
  expect(
    (await mcp(token, "notifications/initialized", undefined, null)).status
  ).toBe(202)
  const list = await (await mcp(token, "tools/list")).json()
  expect(list.result.tools.map((t: { name: string }) => t.name)).toContain(
    "update_login"
  )
  const project = (
    await call(token, "create_project", { name: "Via MCP", icon: "🚀" })
  ).value
  const login = (
    await call(token, "create_login", {
      project_id: project.id,
      label: "Robot",
      email: "robot@example.com",
      password: "robot-pass",
      login_type: "password",
      icon: "🤖",
      websites: [{ url: "https://robot.example.com" }],
    })
  ).value
  expect(login.icon).toBe("🤖")
  const updated = (
    await call(token, "update_login", {
      id: login.id,
      label: "Robot 2",
      email: "robot2@example.com",
      password: "robot-pass-2",
    })
  ).value
  expect(updated.websites[0].url).toBe("https://robot.example.com/")
  const got = (await call(token, "get_login", { id: login.id })).value
  expect(got).toMatchObject({
    label: "Robot 2",
    email: "robot2@example.com",
    password: "robot-pass-2",
    icon: "🤖",
  })
  const other = (await call(token, "create_project", { name: "Other" })).value
  expect(
    (await call(token, "update_login", { id: login.id, project_id: other.id }))
      .value.project_id
  ).toBe(other.id)
  expect(
    (await call(token, "update_project", { id: project.id, name: "Renamed" }))
      .value.name
  ).toBe("Renamed")
  expect(
    (await call(token, "list_logins", { query: "robot2" })).value
  ).toHaveLength(1)
  expect(
    (await call(token, "generate_password", { length: 30 })).value.password
  ).toHaveLength(30)
  expect((await call(token, "delete_login", { id: login.id })).value).toEqual({
    ok: true,
  })
  expect(
    (await call(token, "export_backup")).value.projects.length
  ).toBeGreaterThan(0)
})
test("MCP respects view-only and disabled access", async () => {
  const token = await mcpToken("viewer")
  const denied = await call(token, "create_project", { name: "Nope" })
  expect(denied.error).toBe(true)
  expect(denied.value).toContain("view-only")
  expect((await call(token, "list_projects")).error).toBeUndefined()
  db.sqlite.query("UPDATE users SET approved = 0 WHERE id = 'viewer'").run()
  expect((await mcp(token, "ping")).status).toBe(403)
  expect(
    (
      await app.request(
        "http://localhost:8787/api/mcp",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
        env
      )
    ).status
  ).toBe(401)
})

test("private vault fields are encrypted and only the owner can read, edit or delete them", async () => {
  const input = {
    kind: "note",
    title: "Setup",
    fields: { content: crypto.randomUUID() },
  }
  const saved = (await (
    await request("/personal-items", "POST", input, "member")
  ).json()) as { id: string }
  const path = "/personal-items/" + saved.id
  expect((await request(path, "GET", undefined, "member")).status).toBe(200)
  for (const method of ["GET", "PUT", "DELETE"]) {
    expect(
      (
        await request(
          path,
          method,
          method === "PUT" ? input : undefined,
          "admin"
        )
      ).status
    ).toBe(404)
  }
  expect(
    JSON.stringify(
      await (
        await request("/personal-items", "GET", undefined, "member")
      ).json()
    )
  ).not.toContain(input.fields.content)
  expect(
    JSON.stringify(db.sqlite.query("select * from personal_items").all())
  ).not.toContain(input.fields.content)
  expect((await request(path, "DELETE", undefined, "member")).status).toBe(200)
})

test("collections and MCP changes are attributed without storing credential values", async () => {
  const p = await project()
  const a = await account(p.id)
  const token = (
    (await (await request("/mcp/token", "POST", {}, "member")).json()) as {
      token: string
    }
  ).token
  const group = await call(token, "save_collection", {
    name: "Release",
    tag: "shipping",
  })
  expect(group.value.name).toBe("Release")
  const batch = await call(token, "edit_items", {
    edits: [
      { type: "login", id: a.id, tags: ["shipping"], label: "Release console" },
    ],
  })
  expect(batch.value.completed).toEqual([a.id])
  const history = await call(token, "login_activity", { id: a.id })
  expect(history.value.created.name).toBe("admin")
  expect(history.value.rows[0]).toMatchObject({
    source: "MCP",
    email: "member@example.com",
    fields: expect.arrayContaining(["tags", "label"]),
  })
  expect(JSON.stringify(history.value)).not.toContain("a-secret-password")
  expect(
    (await call(token, "list_logins", { tag: "shipping" })).value
  ).toHaveLength(1)
})

test("attachment uploads enforce the limit and preserve ownership on download, rename and delete", async () => {
  const objects = new Map<string, Uint8Array>()
  env.FILES = {
    put: async (key: string, value: Uint8Array | ReadableStream) => {
      objects.set(
        key,
        new Uint8Array(await new Response(value as BodyInit).arrayBuffer())
      )
    },
    get: async (key: string) =>
      objects.has(key)
        ? { body: objects.get(key), size: objects.get(key)!.length }
        : null,
    delete: async (key: string) => {
      objects.delete(key)
    },
  } as unknown as R2Bucket
  const id = (
    (await (
      await request(
        "/files/text",
        "POST",
        { name: "config.json", text: "{}" },
        "member"
      )
    ).json()) as { id: string }
  ).id
  const path = "/files/" + id
  expect(await (await request(path, "GET", undefined, "member")).text()).toBe(
    "{}"
  )
  for (const method of ["GET", "PATCH", "DELETE"]) {
    expect(
      (
        await request(
          path,
          method,
          method === "PATCH" ? { name: "x" } : undefined
        )
      ).status
    ).toBe(404)
  }
  expect(
    (await request(path, "PATCH", { name: "updated.json" }, "member")).status
  ).toBe(200)
  const response = await app.request(
    "http://localhost:8787/api/files?name=big.bin",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer member",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(50 * 1024 * 1024 + 1),
      },
      body: "x",
    },
    env
  )
  expect(response.status).toBe(413)
  expect((await request(path, "DELETE", undefined, "member")).status).toBe(200)
  expect(objects.size).toBe(0)
})
