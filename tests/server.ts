import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { testDatabase } from "./d1"
import app from "../apps/worker/src/index"
import { encrypt, hash, randomToken } from "../apps/worker/src/crypto"
import type { AppEnv } from "../apps/worker/src/auth"

const db = testDatabase()
const token = randomToken()
const key = btoa("k".repeat(32))
const now = new Date().toISOString()
const fixtureEncrypted = await encrypt(
  "fixture-password",
  key,
  "fixture-account"
)
db.sqlite
  .query(
    "INSERT INTO users (id,google_id,email,name,approved,is_admin,created_at,updated_at) VALUES (?,?,?,?,1,1,?,?)"
  )
  .run(
    "test-admin",
    "test-admin",
    "admin@example.com",
    "Browser test admin",
    now,
    now
  )
db.sqlite
  .query("INSERT INTO sessions VALUES (?,?,?)")
  .run(await hash(token), "test-admin", Date.now() + 3600_000)
db.sqlite
  .query(
    "INSERT INTO projects (id,name,description,urls,login_path,selectors,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)"
  )
  .run(
    "fixture-project",
    "Fixture app",
    "Browser test fixture",
    JSON.stringify(["http://localhost:8798"]),
    "/login",
    JSON.stringify({ email: "", password: "", submit: "", google: "" }),
    now,
    now
  )
db.sqlite
  .query(
    "INSERT INTO accounts (id,project_id,label,email,encrypted_password,login_type,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
  )
  .run(
    "fixture-account",
    "fixture-project",
    "Fixture account",
    "login@example.com",
    fixtureEncrypted,
    "password",
    1,
    now,
    now
  )
const env = {
  DB: db.binding,
  ASSETS: { fetch: () => new Response("assets") },
  APP_ORIGIN: "http://localhost:8799",
  EXTENSION_IDS: "",
  CREDENTIAL_KEY: key,
} as unknown as AppEnv["Bindings"]
const bundle = await Bun.build({
  entrypoints: [
    fileURLToPath(new URL("./fixtures/react-form.tsx", import.meta.url)),
  ],
  target: "browser",
  minify: false,
})
if (!bundle.success) throw new Error("Fixture bundle failed")
const reactJs = await bundle.outputs[0]!.text()
const webDist = new URL("../apps/web/dist/", import.meta.url)
Bun.serve({
  port: 8799,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/fixture/token") return Response.json({ token })
    if (url.pathname === "/fixture/reset") {
      db.sqlite.exec("DELETE FROM preferences")
      db.sqlite.exec("DELETE FROM projects WHERE id != 'fixture-project'")
      db.sqlite.exec("DELETE FROM accounts WHERE id != 'fixture-account'")
      db.sqlite.exec(
        "UPDATE accounts SET is_default = 1 WHERE id = 'fixture-account'"
      )
      db.sqlite
        .query(
          "UPDATE accounts SET label = 'Fixture account',email = 'login@example.com',environment = '',websites = NULL,icon = '',notes = '',encrypted_password = ? WHERE id = 'fixture-account'"
        )
        .run(fixtureEncrypted)
      db.sqlite.exec(
        "UPDATE users SET approved = 1, is_admin = 1 WHERE id = 'test-admin'"
      )
      db.sqlite
        .query(
          "UPDATE projects SET selectors = ?,urls = ?,login_path = '/login',icon = '',name = 'Fixture app',description = 'Browser test fixture' WHERE id = ?"
        )
        .run(
          JSON.stringify({ email: "", password: "", submit: "", google: "" }),
          JSON.stringify(["http://localhost:8798"]),
          "fixture-project"
        )
      return Response.json({ ok: true })
    }
    if (url.pathname === "/fixture/approval") {
      db.sqlite
        .query("UPDATE users SET approved = ? WHERE id = 'test-admin'")
        .run(url.searchParams.get("approved") === "true" ? 1 : 0)
      return Response.json({ ok: true })
    }
    if (url.pathname === "/fixture/member") {
      db.sqlite.exec("UPDATE users SET is_admin = 0 WHERE id = 'test-admin'")
      return Response.json({ ok: true })
    }
    if (url.pathname.startsWith("/api/"))
      return app.request(request, undefined, env)
    if (url.pathname.startsWith("/assets/"))
      return new Response(Bun.file(new URL("." + url.pathname, webDist)))
    return new Response(readFileSync(new URL("index.html", webDist)), {
      headers: { "Content-Type": "text/html" },
    })
  },
})
Bun.serve({
  port: 8798,
  fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/react.js")
      return new Response(reactJs, {
        headers: { "Content-Type": "application/javascript" },
      })
    if (url.pathname === "/health") return new Response("ok")
    if (url.pathname === "/favicon.ico")
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>',
        { headers: { "Content-Type": "image/svg+xml" } }
      )
    if (
      url.searchParams.has("change") ||
      url.searchParams.has("signup") ||
      url.searchParams.has("reset")
    ) {
      const signup = url.searchParams.has("signup")
      const reset = url.searchParams.has("reset")
      return new Response(
        `<!doctype html><html><head><meta name="application-name" content="Fixture app"></head><body><form id="password-change"><h1>${signup ? "Create account" : "Change password"}</h1>${reset ? "" : '<input id="email" type="email" autocomplete="username">'}${signup || reset ? "" : '<input id="current" type="password" autocomplete="current-password">'}<input id="new" name="new-password" type="password" autocomplete="new-password"><input id="confirm" name="confirm-password" type="password" autocomplete="new-password"><button type="submit">${signup ? "Register" : "Update password"}</button></form><script>document.querySelector('form').addEventListener('submit', e=>{e.preventDefault();document.body.dataset.changed='true'})</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      )
    }
    const react = url.searchParams.has("react")
    const custom = url.searchParams.has("custom")
    const google = url.searchParams.has("google")
    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="application-name" content="Fixture app"><title>Fixture login</title></head><body>${google ? '<button id="oauth" onclick="document.body.dataset.google=\'opened\'">Continue with Google</button>' : react ? '<div id="root"></div><script src="/react.js" type="module"></script>' : `<form id="login-form"><input id="${custom ? "identity" : "email"}" name="${custom ? "identity" : "email"}" type="${custom ? "text" : "email"}"><input id="${custom ? "secret" : "password"}" type="${custom ? "text" : "password"}"><button id="submit-login" type="submit">Login</button></form><script>document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); document.body.dataset.submitted = JSON.stringify({ email: document.querySelector('#${custom ? "identity" : "email"}').value, password: document.querySelector('#${custom ? "secret" : "password"}').value }); document.body.dataset.count = String(Number(document.body.dataset.count || '0') + 1); });</script>`}</body></html>`,
      { headers: { "Content-Type": "text/html" } }
    )
  },
})
console.log(
  "Browser fixture servers ready on 8798 and 8799 (isolated in-memory DB)."
)
