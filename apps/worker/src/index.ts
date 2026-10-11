import { Hono } from "hono"
import { cors } from "hono/cors"
import { bodyLimit } from "hono/body-limit"
import { HTTPException } from "hono/http-exception"
import { and, desc, eq } from "drizzle-orm"
import { z, ZodError } from "zod"
import {
  accountSchema,
  preferenceSchema,
  projectSchema,
} from "@workspace/shared"
import {
  auth,
  authenticated,
  approved,
  admin,
  database,
  extensionIds,
  safeMutation,
  type AppEnv,
} from "./auth"
import { accounts, preferences, projects, users } from "./schema"
import { decrypt, encrypt } from "./crypto"

const app = new Hono<AppEnv>()
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store")
  c.header("X-Content-Type-Options", "nosniff")
  c.header("Referrer-Policy", "no-referrer")
  await next()
})
app.use(
  "/api/*",
  cors({
    origin: (origin, c) =>
      extensionIds(c.env).some((id) => origin === `chrome-extension://${id}`)
        ? origin
        : "",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
)
app.use("/api/*", bodyLimit({ maxSize: 524288 }))
app.route("/api/auth", auth)
app.use("/api/*", safeMutation, authenticated)
app.get("/api/me", (c) => c.json(c.get("user")))
app.use("/api/*", approved)

const publicAccount = ({
  encrypted_password: _secret,
  ...account
}: typeof accounts.$inferSelect) => ({
  ...account,
  websites: account.websites ?? undefined,
})
app.get("/api/users", admin, async (c) =>
  c.json(
    await database(c.env).select().from(users).orderBy(desc(users.created_at))
  )
)
app.patch("/api/users/:id", admin, async (c) => {
  const input = z.object({ approved: z.boolean() }).parse(await c.req.json())
  if (c.req.param("id") === c.get("user").id)
    throw new HTTPException(400, {
      message: "You cannot disable your own account",
    })
  const [user] = await database(c.env)
    .update(users)
    .set({ ...input, updated_at: new Date().toISOString() })
    .where(eq(users.id, c.req.param("id")))
    .returning()
  if (!user) throw new HTTPException(404, { message: "User not found" })
  return c.json(user)
})
app.get("/api/projects", async (c) =>
  c.json(
    await database(c.env)
      .select()
      .from(projects)
      .orderBy(desc(projects.updated_at))
  )
)
app.get("/api/projects/:id", async (c) => {
  const [project] = await database(c.env)
    .select()
    .from(projects)
    .where(eq(projects.id, c.req.param("id")))
  if (!project) throw new HTTPException(404, { message: "Project not found" })
  return c.json(project)
})
app.post("/api/projects", admin, async (c) => {
  const input = projectSchema.parse(await c.req.json())
  const now = new Date().toISOString()
  const [project] = await database(c.env)
    .insert(projects)
    .values({
      ...input,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    })
    .returning()
  return c.json(project, 201)
})
app.put("/api/projects/:id", admin, async (c) => {
  const raw = await c.req.json()
  const input = projectSchema.parse(raw)
  const { urls, login_path, selectors, ...folder } = input
  const changes = {
    ...folder,
    ...(raw.urls !== undefined ? { urls } : {}),
    ...(raw.login_path !== undefined ? { login_path } : {}),
    ...(raw.selectors !== undefined ? { selectors } : {}),
  }
  const [project] = await database(c.env)
    .update(projects)
    .set({ ...changes, updated_at: new Date().toISOString() })
    .where(eq(projects.id, c.req.param("id")))
    .returning()
  if (!project) throw new HTTPException(404, { message: "Project not found" })
  return c.json(project)
})
app.delete("/api/projects/:id", admin, async (c) => {
  const removed = await database(c.env)
    .delete(projects)
    .where(eq(projects.id, c.req.param("id")))
    .returning({ id: projects.id })
  if (!removed.length)
    throw new HTTPException(404, { message: "Project not found" })
  return c.json({ ok: true })
})
app.get("/api/accounts", async (c) => {
  const projectId = c.req.query("project_id")
  const rows = await database(c.env)
    .select()
    .from(accounts)
    .where(projectId ? eq(accounts.project_id, projectId) : undefined)
    .orderBy(desc(accounts.is_default), accounts.label)
  return c.json(rows.map(publicAccount))
})
app.post("/api/accounts/:id/password", async (c) => {
  const [account] = await database(c.env)
    .select()
    .from(accounts)
    .where(eq(accounts.id, c.req.param("id")))
  if (!account) throw new HTTPException(404, { message: "Account not found" })
  return c.json({
    password: account.encrypted_password
      ? await decrypt(
          account.encrypted_password,
          c.env.CREDENTIAL_KEY,
          account.id
        )
      : "",
  })
})
for (const method of ["post", "put"] as const) {
  app[method](
    method === "post" ? "/api/accounts" : "/api/accounts/:id",
    admin,
    async (c) => {
      const raw = await c.req.json()
      const input = accountSchema.parse(raw)
      const db = database(c.env)
      const id = method === "post" ? crypto.randomUUID() : c.req.param("id")!
      const [existing] =
        method === "put"
          ? await db.select().from(accounts).where(eq(accounts.id, id))
          : []
      if (method === "put" && !existing)
        throw new HTTPException(404, { message: "Account not found" })
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.project_id))
      if (!project)
        throw new HTTPException(404, { message: "Project not found" })
      if (
        input.websites === undefined &&
        input.environment &&
        !project.urls.some(
          (url) => new URL(url).origin === new URL(input.environment).origin
        )
      )
        throw new HTTPException(400, {
          message: "Environment must belong to this project",
        })
      const { password, ...metadata } = input
      metadata.icon ??= existing?.icon ?? ""
      metadata.notes ??= existing?.notes ?? ""
      // Legacy clients may still submit environment/project URLs. Preserve explicit
      // login websites on password-only updates; derive associations on creation.
      const legacySites = project.urls
        .filter(
          (url) =>
            !input.environment ||
            new URL(url).origin === new URL(input.environment).origin
        )
        .map((url) => ({
          url,
          login_path: project.login_path,
          selectors: project.selectors,
        }))
      metadata.websites ??=
        existing &&
        (raw.environment === undefined ||
          existing.environment === input.environment)
          ? (existing.websites ?? legacySites)
          : legacySites
      if (
        input.login_type === "password" &&
        !(
          password ||
          (existing?.login_type === "password" && existing.encrypted_password)
        )
      )
        throw new HTTPException(400, { message: "A password is required" })
      const encrypted_password =
        input.login_type === "google"
          ? null
          : password !== undefined
            ? await encrypt(password, c.env.CREDENTIAL_KEY, id)
            : existing!.encrypted_password
      const now = new Date().toISOString()
      const values = { ...metadata, encrypted_password, updated_at: now }
      // D1 batch is transactional: clear the previous default and write the new one together.
      const mutation =
        method === "post"
          ? db
              .insert(accounts)
              .values({ ...values, id, created_at: now })
              .returning()
          : db
              .update(accounts)
              .set(values)
              .where(eq(accounts.id, id))
              .returning()
      const preferenceUpdates =
        existing && existing.project_id !== input.project_id
          ? [
              db
                .update(preferences)
                .set({ account_id: null, auto_login: false })
                .where(eq(preferences.account_id, id)),
            ]
          : []
      const results = input.is_default
        ? await db.batch([
            db
              .update(accounts)
              .set({ is_default: false })
              .where(eq(accounts.project_id, input.project_id)),
            mutation,
            ...preferenceUpdates,
          ])
        : await db.batch([mutation, ...preferenceUpdates])
      const result = results[
        input.is_default ? 1 : 0
      ] as (typeof accounts.$inferSelect)[]
      return c.json(publicAccount(result[0]!), method === "post" ? 201 : 200)
    }
  )
}
app.delete("/api/accounts/:id", admin, async (c) => {
  const db = database(c.env)
  const [, result] = await db.batch([
    db
      .update(preferences)
      .set({ auto_login: false })
      .where(eq(preferences.account_id, c.req.param("id"))),
    db
      .delete(accounts)
      .where(eq(accounts.id, c.req.param("id")))
      .returning({ id: accounts.id }),
  ])
  if (!result.length)
    throw new HTTPException(404, { message: "Account not found" })
  return c.json({ ok: true })
})
app.get("/api/preferences", async (c) => {
  const rows = await database(c.env)
    .select({
      project_id: preferences.project_id,
      account_id: preferences.account_id,
      auto_login: preferences.auto_login,
    })
    .from(preferences)
    .where(eq(preferences.user_id, c.get("user").id))
  return c.json(rows)
})
app.put("/api/preferences", async (c) => {
  const input = preferenceSchema.parse(await c.req.json())
  const db = database(c.env)
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.project_id))
  if (!project) throw new HTTPException(404, { message: "Project not found" })
  if (input.account_id) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.id, input.account_id),
          eq(accounts.project_id, input.project_id)
        )
      )
    if (!account)
      throw new HTTPException(400, {
        message: "Account does not belong to this project",
      })
  }
  await db
    .insert(preferences)
    .values({ ...input, user_id: c.get("user").id })
    .onConflictDoUpdate({
      target: [preferences.user_id, preferences.project_id],
      set: input,
    })
  return c.json(input)
})
app.get("/api/sync", async (c) => {
  const db = database(c.env)
  const [projectRows, accountRows, preferenceRows] = await db.batch([
    db.select().from(projects).orderBy(desc(projects.updated_at)),
    db
      .select()
      .from(accounts)
      .orderBy(desc(accounts.is_default), accounts.label),
    db
      .select({
        project_id: preferences.project_id,
        account_id: preferences.account_id,
        auto_login: preferences.auto_login,
      })
      .from(preferences)
      .where(eq(preferences.user_id, c.get("user").id)),
  ])
  const data = {
    projects: projectRows,
    accounts: accountRows.map(publicAccount),
    preferences: preferenceRows,
  }
  // A metadata fingerprint includes deletions and preference changes, without returning secrets.
  const { hash } = await import("./crypto")
  return c.json({ ...data, revision: await hash(JSON.stringify(data)) })
})
app.all("/api/*", (c) => c.json({ error: "API route not found" }, 404))
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw))
app.onError((error, c) => {
  if (error instanceof ZodError || error instanceof SyntaxError)
    return c.json(
      {
        error:
          error instanceof ZodError
            ? error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("; ")
            : "Invalid JSON",
      },
      400
    )
  if (error instanceof HTTPException)
    return c.json({ error: error.message }, error.status)
  console.error("Request failed", { path: c.req.path, name: error.name })
  return c.json({ error: "Request failed. Please try again." }, 500)
})
export default app
