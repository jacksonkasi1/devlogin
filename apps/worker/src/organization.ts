import { Hono, type Context } from "hono"
import { and, desc, eq, sql, type SQL } from "drizzle-orm"
import { z } from "zod"
import { accounts, projects, activities, collections, users } from "./schema"
import { database, editor, type AppEnv } from "./auth"
export function activity(
  c: Context<AppEnv>,
  id: string,
  action: string,
  fields: string[]
) {
  return database(c.env)
    .insert(activities)
    .values({
      item_id: id,
      actor: c.get("user").id,
      source: c.get("viaMcp") ? "MCP" : "App",
      at: new Date().toISOString(),
      action,
      fields,
    })
}
export function logMatchingAccounts(
  c: Context<AppEnv>,
  where: SQL,
  action: string,
  fields: string[]
) {
  const db = database(c.env)
  return db.insert(activities).select(
    db
      .select({
        id: sql<number>`NULL`.as("event_id"),
        item_id: accounts.id,
        actor: sql<string>`${c.get("user").id}`.as("actor"),
        source: sql<string>`${c.get("viaMcp") ? "MCP" : "App"}`.as("source"),
        action: sql<string>`${action}`.as("action"),
        fields: sql<string[]>`${JSON.stringify(fields)}`.as("fields"),
        at: sql<string>`${new Date().toISOString()}`.as("at"),
      })
      .from(accounts)
      .innerJoin(projects, eq(accounts.project_id, projects.id))
      .where(where)
  )
}
function matchesTags(oldTag: string, newTag: string, scope?: string | null) {
  return and(
    scope ? eq(accounts.project_id, scope) : undefined,
    sql`exists(select 1 from json_each(${accounts.tags}) where lower(value) in (lower(${oldTag}),lower(${newTag}))) or exists(select 1 from json_each(${projects.tags}) where lower(value) in (lower(${oldTag}),lower(${newTag})))`
  )!
}
export const organization = new Hono<AppEnv>()
const group = z.object({
  project_id: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(64),
  tag: z.string().trim().min(1).max(48),
})
organization.get("/collections", async (c) =>
  c.json(
    await database(c.env).select().from(collections).orderBy(collections.name)
  )
)
for (const method of ["post", "put"] as const)
  organization[method](
    method === "post" ? "/collections" : "/collections/:id",
    editor,
    async (c) => {
      const data = group.parse(await c.req.json()),
        db = database(c.env),
        id = method === "post" ? crypto.randomUUID() : c.req.param("id")!
      if (
        (
          await db
            .select()
            .from(collections)
            .where(eq(collections.name, data.name))
        ).some((r) => r.id !== id)
      )
        return c.json({ error: "A collection already uses this name" }, 409)
      const [prior] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, id))
      if (method === "put" && !prior)
        return c.json({ error: "Collection not found" }, 404)
      const write =
        method === "post"
          ? db
              .insert(collections)
              .values({ id, ...data })
              .returning()
          : db
              .update(collections)
              .set(data)
              .where(eq(collections.id, id))
              .returning()
      const [[row]] = await db.batch([
        write,
        logMatchingAccounts(
          c,
          matchesTags(
            prior?.tag ?? data.tag,
            data.tag,
            data.project_id ?? prior?.project_id
          ),
          "Collection updated",
          [data.name]
        ),
      ])
      return row ? c.json(row) : c.json({ error: "Collection not found" }, 404)
    }
  )
organization.delete("/collections/:id", editor, async (c) => {
  const db = database(c.env),
    id = c.req.param("id")
  const [group] = await db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
  if (!group) return c.json({ error: "Collection not found" }, 404)
  const [rows] = await db.batch([
    db.delete(collections).where(eq(collections.id, id)).returning(),
    logMatchingAccounts(
      c,
      matchesTags(group.tag, group.tag, group.project_id),
      "Collection removed",
      [group.name]
    ),
  ])
  return rows.length
    ? c.json({ ok: true })
    : c.json({ error: "Collection not found" }, 404)
})
organization.get("/activity/:id", async (c) => {
  const db = database(c.env),
    id = c.req.param("id")
  const query = () =>
    db
      .select({
        id: activities.id,
        source: activities.source,
        action: activities.action,
        fields: activities.fields,
        at: activities.at,
        name: users.name,
        email: users.email,
        avatar: users.avatar_url,
      })
      .from(activities)
      .innerJoin(users, eq(users.id, activities.actor))
  const rows = await query()
    .where(eq(activities.item_id, id))
    .orderBy(desc(activities.id))

  const [created] = await query()
    .where(and(eq(activities.item_id, id), eq(activities.action, "Created")))
    .limit(1)
  return c.json({ created: created ?? null, rows })
})
