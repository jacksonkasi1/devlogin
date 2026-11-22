import { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import { personalSchema } from "@workspace/shared"
import { database, type AppEnv } from "./auth"
import { personalItems as items } from "./schema"
import { decrypt, encrypt } from "./crypto"
const { id, kind, title, icon, tags } = items
const metadata = { id, kind, title, icon, tags }
export const personalApi = new Hono<AppEnv>()
personalApi.get("/", async (c) =>
  c.json(
    await database(c.env)
      .select(metadata)
      .from(items)
      .where(eq(items.owner_id, c.get("user").id))
      .orderBy(items.title)
  )
)
personalApi.get("/:id", async (c) => {
  const [item] = await database(c.env)
    .select()
    .from(items)
    .where(
      and(eq(items.id, c.req.param("id")), eq(items.owner_id, c.get("user").id))
    )
  if (!item) return c.json({ error: "Item not found" }, 404)
  const { encrypted_fields, owner_id, ...summary } = item
  const fields = JSON.parse(
    await decrypt(
      encrypted_fields,
      c.env.CREDENTIAL_KEY,
      `personal:${owner_id}:${item.id}`
    )
  )
  return c.json({ ...summary, fields })
})
for (const method of ["post", "put"] as const) {
  personalApi[method](method === "post" ? "/" : "/:id", async (c) => {
    const { fields, ...data } = personalSchema.parse(await c.req.json())
    const owner = c.get("user").id
    const key = method === "post" ? crypto.randomUUID() : c.req.param("id")!
    const values = {
      ...data,
      encrypted_fields: await encrypt(
        JSON.stringify(fields),
        c.env.CREDENTIAL_KEY,
        `personal:${owner}:${key}`
      ),
    }
    const db = database(c.env)
    const [saved] =
      method === "post"
        ? await db
            .insert(items)
            .values({ ...values, id: key, owner_id: owner })
            .returning(metadata)
        : await db
            .update(items)
            .set(values)
            .where(and(eq(items.id, key), eq(items.owner_id, owner)))
            .returning(metadata)
    return saved ? c.json(saved) : c.json({ error: "Item not found" }, 404)
  })
}
personalApi.delete("/:id", async (c) => {
  const deleted = await database(c.env)
    .delete(items)
    .where(
      and(eq(items.id, c.req.param("id")), eq(items.owner_id, c.get("user").id))
    )
    .returning({ id })
  return deleted.length
    ? c.json({ ok: true })
    : c.json({ error: "Item not found" }, 404)
})
