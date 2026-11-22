import { Hono, type Context } from "hono"
import { and, eq, desc } from "drizzle-orm"
import { z } from "zod"
import { accounts, attachments as files } from "./schema"
import { database, type AppEnv } from "./auth"
export const maxFileBytes = 50 * 1024 * 1024
const filename = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(/^[^/\\\x00-\x1f\x7f]+$/)
const metadata = {
  id: files.id,
  account_id: files.account_id,
  name: files.name,
  size: files.size,
  created_at: files.created_at,
}
const owned = (c: Context<AppEnv>, id: string) =>
  and(eq(files.id, id), eq(files.owner_id, c.get("user").id))
const key = (c: Context<AppEnv>, id: string) => c.get("user").id + "/" + id
async function store(
  c: Context<AppEnv>,
  name: string,
  size: number,
  body: ReadableStream | Uint8Array,
  accountId?: string
) {
  const id = crypto.randomUUID()
  if (
    accountId &&
    !(await database(c.env)
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .get())
  )
    return c.json({ error: "Login not found" }, 404)
  await c.env.FILES.put(key(c, id), body)
  try {
    const [file] = await database(c.env)
      .insert(files)
      .values({
        id,
        account_id: accountId,
        owner_id: c.get("user").id,
        name,
        size,
        created_at: new Date().toISOString(),
      })
      .returning(metadata)
    return c.json(file, 201)
  } catch (error) {
    await c.env.FILES.delete(key(c, id))
    throw error
  }
}
export const fileApi = new Hono<AppEnv>()
fileApi.get("/", async (c) =>
  c.json(
    await database(c.env)
      .select(metadata)
      .from(files)
      .where(eq(files.owner_id, c.get("user").id))
      .orderBy(desc(files.created_at))
  )
)
fileApi.post("/", async (c) => {
  const length = c.req.header("Content-Length")
  if (!length || !/^\d+$/.test(length))
    return c.json({ error: "File size required" }, 411)
  if (Number(length) > maxFileBytes)
    return c.json({ error: "Maximum file size is 50 MB" }, 413)
  return store(
    c,
    filename.parse(c.req.query("name")),
    Number(length),
    c.req.raw.body ?? new Uint8Array(),
    c.req.query("account") || undefined
  )
})
fileApi.post("/text", async (c) => {
  const { name, text, account_id } = z
    .object({
      name: filename,
      text: z.string().max(64000),
      account_id: z.string().min(1).optional(),
    })
    .parse(await c.req.json())
  const data = new TextEncoder().encode(text)
  return store(c, name, data.byteLength, data, account_id)
})
fileApi.get("/:id", async (c) => {
  const id = c.req.param("id")
  const [file] = await database(c.env)
    .select(metadata)
    .from(files)
    .where(owned(c, id))
  if (!file) return c.json({ error: "File not found" }, 404)
  const obj = await c.env.FILES.get(key(c, id))
  if (!obj) return c.json({ error: "File not found" }, 404)
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(obj.size),
      "Content-Disposition":
        "attachment; filename*=UTF-8''" + encodeURIComponent(file.name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  })
})
fileApi.patch("/:id", async (c) => {
  const input = z
    .object({
      name: filename.optional(),
      account_id: z.string().min(1).nullable().optional(),
    })
    .refine((input) => Object.keys(input).length > 0)
    .parse(await c.req.json())
  const [file] = await database(c.env)
    .update(files)
    .set(input)
    .where(owned(c, c.req.param("id")))
    .returning(metadata)
  return file ? c.json(file) : c.json({ error: "File not found" }, 404)
})
fileApi.delete("/:id", async (c) => {
  const id = c.req.param("id")
  const [file] = await database(c.env)
    .select({ id: files.id })
    .from(files)
    .where(owned(c, id))
  if (!file) return c.json({ error: "File not found" }, 404)
  await c.env.FILES.delete(key(c, id))
  await database(c.env).delete(files).where(owned(c, id))
  return c.json({ ok: true })
})
