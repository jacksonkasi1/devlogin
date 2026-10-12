import { afterEach, expect, test } from "bun:test"
import { declaredFavicon, publicWebsite } from "../apps/worker/src/favicon"
import app from "../apps/worker/src/index"
import type { AppEnv } from "../apps/worker/src/auth"

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test("public favicon discovery rejects private addresses, credentials, non-HTTPS URLs and custom ports", async () => {
  for (const value of [
    "http://example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://192.168.1.1",
    "https://app.local",
    "https://user:password@example.com",
    "https://example.com:8443",
  ]) {
    expect(publicWebsite(value)).toBeUndefined()
    const response = await app.request(
      `https://devlogin.peacockindia.in/api/favicon?url=${encodeURIComponent(value)}`,
      undefined,
      { EXTENSION_IDS: "" } as AppEnv["Bindings"]
    )
    expect(response.status).toBe(400)
  }
  expect(publicWebsite("https://sandbox.vizfleet.com")?.origin).toBe(
    "https://sandbox.vizfleet.com"
  )
})

test("favicon discovery stops before following a redirect to a private host", async () => {
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    return new Response(null, {
      status: 302,
      headers: { Location: "https://127.0.0.1/private" },
    })
  }) as typeof fetch
  expect(await declaredFavicon(new URL("https://example.com"))).toBeUndefined()
  expect(requests).toBe(1)
})

test("favicon discovery never forwards website paths, queries, cookies or authorization", async () => {
  globalThis.fetch = (async (input, init) => {
    expect(String(input)).toBe("https://example.com/")
    expect(init?.redirect).toBe("manual")
    expect(new Headers(init?.headers).get("Cookie")).toBeNull()
    expect(new Headers(init?.headers).get("Authorization")).toBeNull()
    return new Response("not HTML", {
      headers: { "Content-Type": "text/plain" },
    })
  }) as typeof fetch
  expect(
    await declaredFavicon(new URL("https://example.com/login?private=secret"))
  ).toBeUndefined()
})
