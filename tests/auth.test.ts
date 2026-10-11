import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import app from "../apps/worker/src/index"
import { hash, randomToken } from "../apps/worker/src/crypto"
import { testDatabase } from "./d1"
import type { AppEnv } from "../apps/worker/src/auth"

let db: ReturnType<typeof testDatabase>
let env: AppEnv["Bindings"]
const originalFetch = globalThis.fetch
const extensionId = "a".repeat(32)
beforeEach(() => {
  db = testDatabase()
  env = {
    DB: db.binding,
    ASSETS: { fetch: () => new Response("assets") },
    APP_ORIGIN: "http://localhost:8787",
    EXTENSION_IDS: extensionId,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    CREDENTIAL_KEY: btoa("k".repeat(32)),
  } as unknown as AppEnv["Bindings"]
})
afterEach(() => {
  globalThis.fetch = originalFetch
  db.sqlite.close()
})
const request = (path: string, options?: RequestInit) =>
  app.request(`http://localhost:8787${path}`, options, env)
function stubGoogle(verified = true) {
  globalThis.fetch = mock(
    async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(input).includes("/token")
            ? { access_token: "google-token" }
            : {
                sub: "google-user",
                email: "user@example.com",
                email_verified: verified,
                name: "Test User",
              }
        ),
        { headers: { "Content-Type": "application/json" } }
      )
  ) as typeof fetch
}
async function browserLogin() {
  stubGoogle()
  const start = await request("/api/auth/google")
  const state = new URL(start.headers.get("Location")!).searchParams.get(
    "state"
  )!
  return request(`/api/auth/callback?code=google-code&state=${state}`, {
    headers: { Cookie: `devlogin_oauth=${state}` },
  })
}
function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .find((c) => c.startsWith("devlogin_session="))!
    .split(";")[0]!
}

describe("Google authentication and approval", () => {
  test("anonymous requests cannot read workspace", async () => {
    for (const path of [
      "/api/me",
      "/api/projects",
      "/api/accounts",
      "/api/users",
      "/api/preferences",
      "/api/sync",
    ])
      expect((await request(path)).status).toBe(401)
  })
  test("OAuth state is required, browser bound and single use", async () => {
    expect(
      (await request("/api/auth/callback?code=x&state=unknown")).status
    ).toBe(400)
    const start = await request("/api/auth/google")
    const state = new URL(start.headers.get("Location")!).searchParams.get(
      "state"
    )!
    expect(
      (await request(`/api/auth/callback?code=x&state=${state}`)).status
    ).toBe(400)
    expect(
      (
        await request(`/api/auth/callback?code=x&state=${state}`, {
          headers: { Cookie: `devlogin_oauth=${state}` },
        })
      ).status
    ).toBe(400)
  })
  test("registration defaults to pending; SQL approval grants access on same session", async () => {
    const login = await browserLogin()
    expect(login.status).toBe(302)
    const cookie = cookieFrom(login)
    expect(login.headers.getSetCookie().join(" ")).toContain("HttpOnly")
    const me = await request("/api/me", { headers: { Cookie: cookie } })
    expect(await me.json()).toMatchObject({
      approved: false,
      is_admin: false,
      email: "user@example.com",
    })
    expect(
      (await request("/api/sync", { headers: { Cookie: cookie } })).status
    ).toBe(403)
    db.sqlite.exec(
      "UPDATE users SET approved = 1, is_admin = 1 WHERE email = 'user@example.com'"
    )
    expect(
      (await request("/api/sync", { headers: { Cookie: cookie } })).status
    ).toBe(200)
    expect(
      (await request("/api/users", { headers: { Cookie: cookie } })).status
    ).toBe(200)
    db.sqlite.exec("UPDATE users SET approved = 0")
    expect(
      (await request("/api/accounts", { headers: { Cookie: cookie } })).status
    ).toBe(403)
  })
  test("repeat login preserves approval and administrator flags", async () => {
    await browserLogin()
    db.sqlite.exec("UPDATE users SET approved = 1, is_admin = 1")
    const cookie = cookieFrom(await browserLogin())
    expect(
      await (await request("/api/me", { headers: { Cookie: cookie } })).json()
    ).toMatchObject({ approved: true, is_admin: true })
    expect(
      db.sqlite.query("SELECT COUNT(*) AS count FROM users").get()
    ).toEqual({ count: 1 })
  })
  test("unverified Google email cannot register", async () => {
    const start = await request("/api/auth/google")
    const state = new URL(start.headers.get("Location")!).searchParams.get(
      "state"
    )!
    stubGoogle(false)
    const response = await request(`/api/auth/callback?code=x&state=${state}`, {
      headers: { Cookie: `devlogin_oauth=${state}` },
    })
    expect(response.headers.get("Location")).toContain("auth_error")
    expect(
      db.sqlite.query("SELECT COUNT(*) AS count FROM users").get()
    ).toEqual({ count: 0 })
  })
  test("extension redirect allowlist and PKCE exchange", async () => {
    expect(
      (await request("/api/auth/google?redirect_uri=https://evil.test")).status
    ).toBe(400)
    const verifier = randomToken()
    const start = await request(
      `/api/auth/google?redirect_uri=${encodeURIComponent(`https://${extensionId}.chromiumapp.org/`)}&code_challenge=${await hash(verifier)}`
    )
    const state = new URL(start.headers.get("Location")!).searchParams.get(
      "state"
    )!
    stubGoogle()
    const callback = await request(`/api/auth/callback?code=x&state=${state}`)
    const code = new URL(callback.headers.get("Location")!).searchParams.get(
      "code"
    )!
    const exchange = (value: string) =>
      request("/api/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, verifier: value }),
      })
    expect((await exchange(randomToken())).status).toBe(400)
    const result = await exchange(verifier)
    expect(result.status).toBe(200)
    const { token } = (await result.json()) as { token: string }
    expect(
      (
        await request("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status
    ).toBe(200)
    expect((await exchange(verifier)).status).toBe(400)
    expect(
      db.sqlite.query("SELECT token_hash FROM sessions").get()
    ).not.toEqual({ token_hash: token })
  })
  test("sessions expire; logout revokes; cookie mutations require correct origin", async () => {
    const cookie = cookieFrom(await browserLogin())
    expect(
      (
        await request("/api/auth/logout", {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: "https://evil.test",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status
    ).toBe(403)
    const logout = await request("/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: env.APP_ORIGIN,
        "Content-Type": "application/json",
      },
      body: "{}",
    })
    expect(logout.status).toBe(200)
    expect(
      (await request("/api/me", { headers: { Cookie: cookie } })).status
    ).toBe(401)
    const newCookie = cookieFrom(await browserLogin())
    db.sqlite.exec("UPDATE sessions SET expires_at = 0")
    expect(
      (await request("/api/me", { headers: { Cookie: newCookie } })).status
    ).toBe(401)
  })
})
