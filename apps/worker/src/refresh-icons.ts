import { and, eq, gt } from "drizzle-orm"
import { z } from "zod"
import { accountWebsites } from "@workspace/shared"
import { accounts, projects } from "./schema"
import { database } from "./auth"
import { declaredFavicon, publicWebsite } from "./favicon"

// Keep a page small enough to fit the Worker's network subrequest budget.
const scope = z
  .object({
    id: z.string().min(1).optional(),
    after: z.string().min(1).optional(),
  })
  .strict()
export async function refreshIcons(
  db: ReturnType<typeof database>,
  body: unknown
) {
  const { id, after } = scope.parse(body)
  const limit = 4
  const rows = await db
    .select({ account: accounts, project: projects })
    .from(accounts)
    .innerJoin(projects, eq(accounts.project_id, projects.id))
    .where(
      and(
        eq(accounts.icon, ""),
        id ? eq(accounts.id, id) : undefined,
        after ? gt(accounts.id, after) : undefined
      )
    )
    .orderBy(accounts.id)
    .limit(limit + 1)
  const lookups = new Map<string, Promise<string | undefined>>()
  const results = await Promise.all(
    rows.slice(0, limit).map(async ({ account, project }) => {
      const url = publicWebsite(
        accountWebsites(
          { ...account, websites: account.websites ?? undefined },
          project
        )[0]?.url ?? ""
      )
      if (!url) return false
      if (!lookups.has(url.origin))
        lookups.set(
          url.origin,
          discover(url).catch(() => undefined)
        )
      const asset = await lookups.get(url.origin)
      if (!asset) return false
      const changed = await db
        .update(accounts)
        .set({
          favicon: {
            origin: url.origin,
            url: asset,
            revision: crypto.randomUUID(),
          },
        })
        .where(
          and(
            eq(accounts.id, account.id),
            eq(accounts.updated_at, account.updated_at),
            eq(accounts.icon, "")
          )
        )
        .returning({ id: accounts.id })
      return changed.length > 0
    })
  )
  return {
    refreshed: results.filter(Boolean).length,
    skipped: results.filter((x) => !x).length,
    next: rows.length > limit ? rows[limit - 1].account.id : null,
  }
}
async function discover(url: URL) {
  const declared = await declaredFavicon(url)
  if (declared) return declared
  const signal = AbortSignal.timeout(3500)
  for (const path of [
    "/favicon.ico",
    "/favicon.svg",
    "/apple-touch-icon.png",
    "/favicon.png",
    "/logo.svg",
    "/logo.png",
  ]) {
    const asset = new URL(path, url.origin)
    const response = await fetch(asset, {
      method: "HEAD",
      redirect: "manual",
      signal,
    })
    if (
      response.ok &&
      response.headers.get("content-type")?.startsWith("image/")
    )
      return asset.href
  }
}
