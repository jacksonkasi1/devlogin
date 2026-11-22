import { Hono } from "hono"
import { cors } from "hono/cors"
import { bodyLimit } from "hono/body-limit"
import { HTTPException } from "hono/http-exception"
import { and, desc, eq, ne } from "drizzle-orm"
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
  backup,
  editor,
  mcpPrefix,
  sessionOnly,
  database,
  extensionIds,
  safeMutation,
  type AppEnv,
} from "./auth"
import { accounts, mcpTokens, preferences, projects, users } from "./schema"
import { decrypt, encrypt, hash, randomToken } from "./crypto"
import { fileApi, maxFileBytes } from "./files"
import { activity, logMatchingAccounts, organization } from "./organization"
import { collections } from "./schema"
import { personalApi } from "./personal-items"
import { refreshIcons } from "./refresh-icons"
import { createMcp } from "./mcp"
import { declaredFavicon, publicWebsite } from "./favicon"

const app = new Hono<AppEnv>()
app.use("*", async (c, next) => {
  const url = new URL(c.req.url)
  if (url.hostname === "globallogin.peacockindia.in") {
    const target = new URL(c.env.APP_ORIGIN)
    target.pathname = url.pathname
    target.search = url.search
    return c.redirect(target.href, 307)
  }
  await next()
})
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
const fileBody = bodyLimit({ maxSize: maxFileBytes })
const smallBody = bodyLimit({ maxSize: 524288 })
const backupBody = bodyLimit({ maxSize: 8 * 1024 * 1024 })
app.use("/api/*", (c, next) =>
  (c.req.path === "/api/files" && c.req.method === "POST"
    ? fileBody
    : c.req.path === "/api/backup/import"
      ? backupBody
      : smallBody)(c, next)
)
app.route("/api/auth", auth)
// Images cannot attach extension bearer tokens. Return only public icon URLs.
app.get("/api/favicon", async (c) => {
  const website = publicWebsite(c.req.query("url") ?? "")
  if (!website) return c.body(null, 400)
  try {
    const icon = await declaredFavicon(website)
    if (!icon) return c.body(null, 404)
    c.header("Cache-Control", "public, max-age=3600")
    return c.redirect(icon, 302)
  } catch {
    return c.body(null, 404)
  }
})
app.use("/api/*", safeMutation, authenticated)
app.get("/api/me", (c) => c.json(c.get("user")))
app.use("/api/*", approved)
app.route("/api/personal-items", personalApi)
app.route("/api/files", fileApi)
app.route("/api", organization)

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
  const input = z
    .object({
      approved: z.boolean().optional(),
      is_admin: z.boolean().optional(),
      can_edit: z.boolean().optional(),
      can_backup: z.boolean().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, "Nothing to change")
    .parse(await c.req.json())
  if (
    c.req.param("id") === c.get("user").id &&
    (input.approved === false || input.is_admin === false)
  )
    throw new HTTPException(400, {
      message: "You cannot disable or demote your own account",
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
app.post("/api/projects", editor, async (c) => {
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
app.put("/api/projects/:id", editor, async (c) => {
  const raw = await c.req.json()
  const input = projectSchema.parse(raw)
  const { urls, login_path, selectors, ...folder } = input
  const changes = {
    ...folder,
    ...(raw.urls !== undefined ? { urls } : {}),
    ...(raw.login_path !== undefined ? { login_path } : {}),
    ...(raw.selectors !== undefined ? { selectors } : {}),
  }
  const db = database(c.env),
    id = c.req.param("id")
  const [prior] = await db.select().from(projects).where(eq(projects.id, id))
  const fields = Object.entries(changes)
    .filter(
      ([key, value]) =>
        value !== undefined &&
        JSON.stringify(value) !==
          JSON.stringify(prior?.[key as keyof typeof prior])
    )
    .map(([key]) => key)
  const write = db
    .update(projects)
    .set({ ...changes, updated_at: new Date().toISOString() })
    .where(eq(projects.id, id))
    .returning()
  const [project] = fields.length
    ? (
        await db.batch([
          write,
          logMatchingAccounts(
            c,
            eq(accounts.project_id, id),
            "Project edited",
            fields
          ),
        ])
      )[0]
    : await write
  if (!project) throw new HTTPException(404, { message: "Project not found" })
  return c.json(project)
})
app.delete("/api/projects/:id", editor, async (c) => {
  const removed = await database(c.env)
    .delete(projects)
    .where(eq(projects.id, c.req.param("id")))
    .returning({ id: projects.id })
  if (!removed.length)
    throw new HTTPException(404, { message: "Project not found" })
  return c.json({ ok: true })
})
app.post("/api/favicons/refresh", editor, async (c) =>
  c.json(await refreshIcons(database(c.env), await c.req.json()))
)
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
    editor,
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
      const changed = Object.entries(metadata)
        .filter(
          ([key, value]) =>
            JSON.stringify(existing?.[key as keyof typeof existing]) !==
            JSON.stringify(value)
        )
        .map(([key]) => key)
      if (
        password !== undefined ||
        (existing?.encrypted_password && !encrypted_password)
      )
        changed.push("password")
      const events =
        changed.length || !existing
          ? [activity(c, id, existing ? "Edited" : "Created", changed)]
          : []
      const results = input.is_default
        ? await db.batch([
            logMatchingAccounts(
              c,
              and(
                eq(accounts.project_id, input.project_id),
                eq(accounts.is_default, true),
                ne(accounts.id, id)
              )!,
              "Edited",
              ["is_default"]
            ),
            db
              .update(accounts)
              .set({ is_default: false })
              .where(eq(accounts.project_id, input.project_id)),
            mutation,
            ...preferenceUpdates,
            ...events,
          ])
        : await db.batch([mutation, ...preferenceUpdates, ...events])
      const result = results[
        input.is_default ? 2 : 0
      ] as (typeof accounts.$inferSelect)[]
      return c.json(publicAccount(result[0]!), method === "post" ? 201 : 200)
    }
  )
}
app.delete("/api/accounts/:id", editor, async (c) => {
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
    collections: await db.select().from(collections).orderBy(collections.name),
    accounts: accountRows.map(publicAccount),
    preferences: preferenceRows,
  }
  // A metadata fingerprint includes deletions and preference changes, without returning secrets.
  const { hash } = await import("./crypto")
  return c.json({ ...data, revision: await hash(JSON.stringify(data)) })
})

// MCP access: every approved user has a personal token that can be viewed or rotated.
const mcpToken = async (
  env: AppEnv["Bindings"],
  userId: string,
  rotate = false
) => {
  const db = database(env)
  const aad = `mcp:${userId}`
  if (!rotate) {
    const [row] = await db
      .select()
      .from(mcpTokens)
      .where(eq(mcpTokens.user_id, userId))
    if (row) return decrypt(row.encrypted_token, env.CREDENTIAL_KEY, aad)
  }
  const token = mcpPrefix + randomToken()
  const values = {
    token_hash: await hash(token),
    encrypted_token: await encrypt(token, env.CREDENTIAL_KEY, aad),
    created_at: new Date().toISOString(),
    last_used_at: null,
  }
  await db
    .insert(mcpTokens)
    .values({ user_id: userId, ...values })
    .onConflictDoUpdate({ target: mcpTokens.user_id, set: values })
  return token
}
app.post("/api/mcp/token", sessionOnly, async (c) =>
  c.json({
    token: await mcpToken(c.env, c.get("user").id),
    url: `${c.env.APP_ORIGIN}/api/mcp`,
  })
)
app.post("/api/mcp/token/reset", sessionOnly, async (c) =>
  c.json({
    token: await mcpToken(c.env, c.get("user").id, true),
    url: `${c.env.APP_ORIGIN}/api/mcp`,
  })
)
app.route(
  "/api/mcp",
  createMcp((request, c) => {
    const context = c as {
      executionCtx?: ExecutionContext
      env: AppEnv["Bindings"]
    }
    let ctx: ExecutionContext | undefined
    try {
      ctx = context.executionCtx
    } catch {
      /* No execution context outside the Workers runtime (tests). */
    }
    return Promise.resolve(app.fetch(request, context.env, ctx))
  })
)

// Backup: full export with decrypted passwords, and a non-destructive import.
app.get("/api/backup", backup, async (c) => {
  const db = database(c.env)
  const [projectRows, accountRows] = await db.batch([
    db.select().from(projects),
    db.select().from(accounts),
  ])
  return c.json({
    format: "devlogin-backup",
    version: 1,
    exported_at: new Date().toISOString(),
    projects: projectRows,
    accounts: await Promise.all(
      accountRows.map(async (account) => ({
        ...publicAccount(account),
        password: account.encrypted_password
          ? await decrypt(
              account.encrypted_password,
              c.env.CREDENTIAL_KEY,
              account.id
            )
          : undefined,
      }))
    ),
  })
})
const importSchema = z.object({
  projects: z
    .array(
      projectSchema.extend({
        id: z.string().min(1).max(100),
        created_at: z.string().optional(),
      })
    )
    .max(5000),
  accounts: z
    .array(
      accountSchema.extend({
        id: z.string().min(1).max(100),
        created_at: z.string().optional(),
      })
    )
    .max(20000),
})
app.post("/api/backup/import", backup, editor, async (c) => {
  const input = importSchema.parse(await c.req.json())
  const db = database(c.env)
  const now = new Date().toISOString()
  const known = new Set(input.projects.map((project) => project.id))
  const existing = new Set(
    (await db.select({ id: projects.id }).from(projects)).map((row) => row.id)
  )
  for (const account of input.accounts)
    if (!known.has(account.project_id) && !existing.has(account.project_id))
      throw new HTTPException(400, {
        message: `Login "${account.label}" refers to an unknown project`,
      })
  const statements: Parameters<typeof db.batch>[0][number][] = []
  for (const project of input.projects) {
    const { id, created_at, ...fields } = project
    statements.push(
      db
        .insert(projects)
        .values({
          ...fields,
          icon: fields.icon ?? "",
          id,
          created_at: created_at ?? now,
          updated_at: now,
        })
        .onConflictDoUpdate({
          target: projects.id,
          set: { ...fields, icon: fields.icon ?? "", updated_at: now },
        })
    )
  }
  for (const account of input.accounts) {
    const { id, created_at, password, ...fields } = account
    if (account.login_type === "password" && !password)
      throw new HTTPException(400, {
        message: `Login "${account.label}" has no password`,
      })
    const values = {
      ...fields,
      icon: fields.icon ?? "",
      notes: fields.notes ?? "",
      websites: fields.websites ?? null,
      encrypted_password:
        account.login_type === "google" || !password
          ? null
          : await encrypt(password, c.env.CREDENTIAL_KEY, id),
      updated_at: now,
    }
    if (account.is_default)
      statements.push(
        db
          .update(accounts)
          .set({ is_default: false })
          .where(eq(accounts.project_id, account.project_id))
      )
    statements.push(
      db
        .insert(accounts)
        .values({ ...values, id, created_at: created_at ?? now })
        .onConflictDoUpdate({ target: accounts.id, set: values })
    )
  }
  for (let index = 0; index < statements.length; index += 40)
    await db.batch(
      statements.slice(index, index + 40) as [
        (typeof statements)[number],
        ...(typeof statements)[number][],
      ]
    )
  return c.json({
    ok: true,
    projects: input.projects.length,
    accounts: input.accounts.length,
  })
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
