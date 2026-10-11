import { expect, test } from "bun:test"
import {
  matchProject,
  accountMatches,
  type Account,
  isLoginPage,
  projectSchema,
  type Project,
} from "../packages/shared/src/index"
import { encrypt, decrypt } from "../apps/worker/src/crypto"
const project = (id: string, urls: string[]): Project => ({
  ...projectSchema.parse({ name: id, urls, login_path: "/login" }),
  id,
  created_at: "",
  updated_at: "",
})
test("matches exact origins including ports; rejects spoofing, sibling domains and HTTP downgrade", () => {
  const p = project("p", [
    "http://localhost:3000",
    "https://staging.example.com",
  ])
  expect(matchProject([p], "http://localhost:3000/login")?.id).toBe("p")
  for (const url of [
    "http://localhost:3001/login",
    "http://127.0.0.1:3000/login",
    "https://staging.example.com.evil.test/login",
    "https://staging.example.com@evil.test/login",
    "http://staging.example.com/login",
  ])
    expect(matchProject([p], url)).toBeUndefined()
  expect(isLoginPage(p, "https://staging.example.com/login?next=/")).toBe(true)
  expect(isLoginPage(p, "https://staging.example.com/login/")).toBe(true)
  expect(isLoginPage(p, "https://staging.example.com/signup")).toBe(false)
})
test("specific application path wins and respects path boundaries", () => {
  const root = project("root", ["https://example.com"])
  const nested = project("nested", ["https://example.com/app"])
  expect(
    matchProject([root, nested], "https://example.com/app/login")?.id
  ).toBe("nested")
  expect(
    matchProject([root, nested], "https://example.com/application/login")?.id
  ).toBe("root")
})
test("AES-GCM uses unique nonces and binds ciphertext to the account ID", async () => {
  const key = btoa("k".repeat(32))
  const first = await encrypt("secret", key, "one")
  const second = await encrypt("secret", key, "one")
  expect(first).not.toBe(second)
  expect(await decrypt(first, key, "one")).toBe("secret")
  await expect(decrypt(first, key, "two")).rejects.toThrow()
  await expect(decrypt(first, btoa("z".repeat(32)), "one")).rejects.toThrow()
})
test("login websites match exact origins, ports and path boundaries", () => {
  const a = {
    websites: [
      { url: "https://sandbox.example.com/login" },
      { url: "https://beta.example.com" },
      { url: "http://localhost:3000" },
    ],
  } as unknown as Account
  for (const url of [
    "https://sandbox.example.com/login?next=1#form",
    "https://sandbox.example.com/login/step2",
    "https://beta.example.com/anywhere",
    "http://localhost:3000/login",
  ])
    expect(accountMatches(a, url)).toBe(true)
  for (const url of [
    "https://sandbox.example.com/logins",
    "https://sandbox.example.com/other",
    "https://evil.beta.example.com",
    "https://beta.example.com.attacker.test",
    "http://localhost:3001/login",
    "http://beta.example.com",
    "javascript:alert(1)",
  ])
    expect(accountMatches(a, url)).toBe(false)
  expect(
    accountMatches({ ...a, websites: [] }, "https://beta.example.com")
  ).toBe(false)
})
