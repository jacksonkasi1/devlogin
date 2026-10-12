import { Hono, type MiddlewareHandler } from "hono"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { drizzle } from "drizzle-orm/d1"
import { and, eq, gt, lt } from "drizzle-orm"
import { z } from "zod"
import { users, sessions, oauthStates, exchanges } from "./schema"
import { hash, randomToken } from "./crypto"
import type { User } from "@workspace/shared"

export type AppEnv = {
  Bindings: Omit<Env, "APP_ORIGIN" | "EXTENSION_IDS" | "DEV_ORIGIN"> & {
    APP_ORIGIN: string
    EXTENSION_IDS: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    CREDENTIAL_KEY: string
    DEV_ORIGIN?: string
  }
  Variables: { user: User; sessionHash: string }
}
const cookie = "devlogin_session"
const lifetime = 30 * 24 * 60 * 60 * 1000
export const database = (env: AppEnv["Bindings"]) => drizzle(env.DB)
export const extensionIds = (env: AppEnv["Bindings"]) =>
  env.EXTENSION_IDS.split(",")
    .map((id) => id.trim())
    .filter((id) => /^[a-p]{32}$/.test(id))

export const authenticated: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header("Authorization")
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : getCookie(c, cookie)
  if (!token) return c.json({ error: "Sign in to continue" }, 401)
  const tokenHash = await hash(token)
  const [record] = await database(c.env)
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(
      and(
        eq(sessions.token_hash, tokenHash),
        gt(sessions.expires_at, Date.now())
      )
    )
  if (!record)
    return c.json({ error: "Your session expired. Sign in again." }, 401)
  c.set("user", record.user)
  c.set("sessionHash", tokenHash)
  await next()
}
export const approved: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user").approved)
    return c.json({ error: "Waiting for approval" }, 403)
  await next()
}
export const admin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user").is_admin)
    return c.json({ error: "Administrator access required" }, 403)
  await next()
}
export const safeMutation: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (!c.req.header("Authorization")?.startsWith("Bearer ")) {
      const origin = c.req.header("Origin")
      if (
        origin !== c.env.APP_ORIGIN &&
        (!c.env.DEV_ORIGIN || origin !== c.env.DEV_ORIGIN)
      )
        return c.json({ error: "Invalid request origin" }, 403)
    }
    if (!c.req.header("Content-Type")?.includes("application/json"))
      return c.json({ error: "JSON request required" }, 415)
  }
  await next()
}
async function createSession(env: AppEnv["Bindings"], userId: string) {
  const token = randomToken()
  await database(env)
    .insert(sessions)
    .values({
      token_hash: await hash(token),
      user_id: userId,
      expires_at: Date.now() + lifetime,
    })
  return token
}

export const auth = new Hono<AppEnv>()
auth.get("/status", (c) => {
  const extensionId = c.req.query("extension_id")
  return c.json({
    configured: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    ...(extensionId !== undefined
      ? { extension_allowed: extensionIds(c.env).includes(extensionId) }
      : {}),
  })
})
auth.get("/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET)
    return c.json({ error: "Google OAuth is not configured" }, 503)
  const redirect = c.req.query("redirect_uri") ?? null
  const challenge = c.req.query("code_challenge") ?? null
  if (redirect) {
    if (
      !extensionIds(c.env).some(
        (id) => redirect === `https://${id}.chromiumapp.org/`
      ) ||
      !challenge ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge)
    )
      return c.json({ error: "Invalid extension OAuth request" }, 400)
  } else if (challenge) return c.json({ error: "Redirect required" }, 400)
  const db = database(c.env)
  await db.batch([
    db.delete(oauthStates).where(lt(oauthStates.expires_at, Date.now())),
    db.delete(exchanges).where(lt(exchanges.expires_at, Date.now())),
    db.delete(sessions).where(lt(sessions.expires_at, Date.now())),
  ])
  const state = randomToken()
  const verifier = randomToken()
  await db.insert(oauthStates).values({
    state,
    verifier,
    redirect,
    challenge,
    expires_at: Date.now() + 600_000,
  })
  if (!redirect)
    setCookie(c, "devlogin_oauth", state, {
      httpOnly: true,
      secure: c.env.APP_ORIGIN.startsWith("https:"),
      sameSite: "Lax",
      path: "/api/auth",
      maxAge: 600,
    })
  const query = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${c.env.APP_ORIGIN}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: await hash(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  })
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`)
})
auth.get("/callback", async (c) => {
  const db = database(c.env)
  const [state] = await db
    .delete(oauthStates)
    .where(
      and(
        eq(oauthStates.state, c.req.query("state") ?? ""),
        gt(oauthStates.expires_at, Date.now())
      )
    )
    .returning()
  if (!state) return c.json({ error: "Invalid or expired OAuth state" }, 400)
  if (!state.redirect && getCookie(c, "devlogin_oauth") !== state.state)
    return c.json({ error: "OAuth browser state mismatch" }, 400)
  deleteCookie(c, "devlogin_oauth", { path: "/api/auth" })
  const failure = () =>
    state.redirect
      ? c.redirect(`${state.redirect}?error=authentication_failed`)
      : c.redirect(`${c.env.APP_ORIGIN}/?auth_error=authentication_failed`)
  const code = c.req.query("code")
  if (!code || c.req.query("error")) return failure()
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: state.verifier,
        grant_type: "authorization_code",
        redirect_uri: `${c.env.APP_ORIGIN}/api/auth/callback`,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!tokenResponse.ok) return failure()
    const tokens = z
      .object({ access_token: z.string() })
      .parse(await tokenResponse.json())
    const profileResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!profileResponse.ok) return failure()
    const profile = z
      .object({
        sub: z.string(),
        email: z.string().email(),
        email_verified: z.literal(true),
        name: z.string().optional(),
        picture: z.string().url().optional(),
      })
      .parse(await profileResponse.json())
    const now = new Date().toISOString()
    const [user] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        google_id: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.email,
        avatar_url: profile.picture ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: users.google_id,
        set: {
          email: profile.email,
          name: profile.name ?? profile.email,
          avatar_url: profile.picture ?? null,
          updated_at: now,
        },
      })
      .returning()
    if (state.redirect && state.challenge) {
      const exchangeCode = randomToken()
      await db.insert(exchanges).values({
        code_hash: await hash(exchangeCode),
        user_id: user!.id,
        challenge: state.challenge,
        expires_at: Date.now() + 60_000,
      })
      return c.redirect(`${state.redirect}?code=${exchangeCode}`)
    }
    setCookie(c, cookie, await createSession(c.env, user!.id), {
      httpOnly: true,
      secure: c.env.APP_ORIGIN.startsWith("https:"),
      sameSite: "Lax",
      path: "/",
      maxAge: lifetime / 1000,
    })
    return c.redirect(c.env.APP_ORIGIN)
  } catch {
    return failure()
  }
})
auth.post("/exchange", async (c) => {
  const input = z
    .object({
      code: z.string().min(1).max(128),
      verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    })
    .parse(await c.req.json())
  const [exchange] = await database(c.env)
    .delete(exchanges)
    .where(
      and(
        eq(exchanges.code_hash, await hash(input.code)),
        eq(exchanges.challenge, await hash(input.verifier)),
        gt(exchanges.expires_at, Date.now())
      )
    )
    .returning()
  if (!exchange)
    return c.json({ error: "Invalid or expired authorization code" }, 400)
  return c.json({ token: await createSession(c.env, exchange.user_id) })
})
auth.post("/logout", safeMutation, authenticated, async (c) => {
  await database(c.env)
    .delete(sessions)
    .where(eq(sessions.token_hash, c.get("sessionHash")))
  deleteCookie(c, cookie, { path: "/" })
  return c.json({ ok: true })
})
