import { afterEach, beforeEach, expect, test } from "bun:test"
import app from "../apps/worker/src/index"
import { hash } from "../apps/worker/src/crypto"
import { testDatabase } from "./d1"
import type { AppEnv } from "../apps/worker/src/auth"
import type { Note, Project, Sync } from "@workspace/shared"

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

test("secure notes are encrypted at rest, synced as metadata and readable on request", async () => {
  const created = await request("/notes", "POST", {
    title: "Staging API key",
    content: "sk_live_secret",
  })
  expect(created.status).toBe(201)
  const note = (await created.json()) as Note
  expect(note.project_id).toBeNull()
  expect(JSON.stringify(note)).not.toContain("sk_live_secret")
  const stored = db.sqlite
    .query("SELECT encrypted_content FROM notes WHERE id = ?")
    .get(note.id) as { encrypted_content: string }
  expect(stored.encrypted_content).toStartWith("v1.")
  expect(stored.encrypted_content).not.toContain("sk_live_secret")
  const sync = (await (await request("/sync")).json()) as Sync
  expect(sync.notes?.map((item) => item.title)).toEqual(["Staging API key"])
  expect(JSON.stringify(sync)).not.toContain("sk_live_secret")
  const read = await request(`/notes/${note.id}/content`, "POST", {}, "member")
  expect(await read.json()).toEqual({ content: "sk_live_secret" })
})

test("note updates keep content unless replaced; members cannot mutate; project deletion cascades", async () => {
  const project = (await (
    await request("/projects", "POST", { name: "Vault" })
  ).json()) as Project
  const note = (await (
    await request("/notes", "POST", {
      project_id: project.id,
      title: "Recovery codes",
      content: "1111 2222",
    })
  ).json()) as Note
  const renamed = await request(`/notes/${note.id}`, "PUT", { title: "Codes" })
  expect(renamed.status).toBe(200)
  expect(((await renamed.json()) as Note).project_id).toBe(project.id)
  expect(
    await (await request(`/notes/${note.id}/content`, "POST", {})).json()
  ).toEqual({ content: "1111 2222" })
  expect(
    (
      await request(
        `/notes/${note.id}`,
        "PUT",
        { title: "x", content: "y" },
        "member"
      )
    ).status
  ).toBe(403)
  expect((await request("/notes", "POST", { title: "No body" })).status).toBe(
    400
  )
  expect(
    (
      await request("/notes", "POST", {
        title: "Orphan",
        content: "z",
        project_id: "missing",
      })
    ).status
  ).toBe(404)
  expect((await request(`/projects/${project.id}`, "DELETE", {})).status).toBe(
    200
  )
  expect((await request(`/notes/${note.id}/content`, "POST", {})).status).toBe(
    404
  )
})

test("encrypts large non-ASCII notes", async () => {
  const { encrypt, decrypt } = await import("../apps/worker/src/crypto")
  const content = "🔐 秘密".repeat(10_000)
  const sealed = await encrypt(content, env.CREDENTIAL_KEY, "note:big")
  expect(await decrypt(sealed, env.CREDENTIAL_KEY, "note:big")).toBe(content)
})
