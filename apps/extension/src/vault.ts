import { browser } from "wxt/browser"
import {
  accountWebsites,
  loginUrl,
  websiteMatches,
  type Account,
  type Note,
  type Project,
  type Sync,
} from "@workspace/shared"
import { send } from "./client"

export type VaultItem =
  | {
      kind: "login"
      id: string
      title: string
      subtitle: string
      account: Account
      project?: Project
      website?: string
      suggested: boolean
      haystack: string
    }
  | {
      kind: "note"
      id: string
      title: string
      subtitle: string
      note: Note
      project?: Project
      suggested: false
      haystack: string
    }
export type Category = "all" | "logins" | "notes"

export function vaultItems(data: Sync | null | undefined, tabUrl = "") {
  if (!data) return []
  const projects = new Map(data.projects.map((p) => [p.id, p]))
  const logins: VaultItem[] = data.accounts.map((account) => {
    const project = projects.get(account.project_id)
    const sites = accountWebsites(account, project)
    return {
      kind: "login",
      id: account.id,
      title: account.label,
      subtitle: account.email,
      account,
      project,
      website: sites[0]?.url,
      suggested:
        /^https?:/.test(tabUrl) &&
        sites.some((site) => websiteMatches(site, tabUrl)),
      haystack: [
        account.label,
        account.email,
        project?.name,
        ...sites.map((site) => site.url),
      ]
        .join(" ")
        .toLowerCase(),
    }
  })
  const notes: VaultItem[] = (data.notes ?? []).map((note) => {
    const project = note.project_id ? projects.get(note.project_id) : undefined
    return {
      kind: "note",
      id: note.id,
      title: note.title,
      subtitle: project ? `Secure note · ${project.name}` : "Secure note",
      note,
      project,
      suggested: false,
      haystack:
        `${note.title} ${project?.name ?? ""} secure note`.toLowerCase(),
    }
  })
  return [...logins, ...notes]
}

// Every word must match somewhere; title-prefix matches rank first, like Spotlight.
export function searchVault(
  items: VaultItem[],
  query: string,
  {
    category = "all",
    projectId = "all",
  }: { category?: Category; projectId?: string } = {}
) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const q = words.join(" ")
  const rank = (item: VaultItem) => {
    const title = item.title.toLowerCase()
    if (!q) return item.suggested ? 0 : 1
    if (title.startsWith(q)) return item.suggested ? 0 : 1
    if (title.includes(q)) return 2
    return item.suggested ? 3 : 4
  }
  return items
    .filter(
      (item) =>
        (category === "all" ||
          (category === "logins") === (item.kind === "login")) &&
        (projectId === "all" || item.project?.id === projectId) &&
        words.every((word) => item.haystack.includes(word))
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        Number(b.kind === "login") - Number(a.kind === "login") ||
        a.title.localeCompare(b.title)
    )
}

export const readPassword = async (accountId: string) =>
  (
    await send<{ password: string }>({
      type: "api",
      path: `/api/accounts/${accountId}/password`,
      method: "POST",
      body: {},
    })
  ).password
export const readNote = async (noteId: string) =>
  (
    await send<{ content: string }>({
      type: "api",
      path: `/api/notes/${noteId}/content`,
      method: "POST",
      body: {},
    })
  ).content

export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // Embedded frames may lack clipboard-write; fall back to a user-gesture copy.
    const area = document.createElement("textarea")
    area.value = value
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none"
    document.body.append(area)
    area.select()
    const ok = document.execCommand("copy")
    area.remove()
    if (!ok) throw new Error("Clipboard unavailable")
  }
}

// Fill on the current page when it matches; otherwise open the saved website and fill there.
export async function autofill(
  item: Extract<VaultItem, { kind: "login" }>,
  options: {
    tabUrl: string
    tabId?: number
    windowId?: number
    submit: boolean
  }
) {
  const sites = accountWebsites(item.account, item.project)
  const here = /^https?:/.test(options.tabUrl)
    ? sites.find((site) => websiteMatches(site, options.tabUrl))
    : undefined
  const target = here
    ? options.tabUrl
    : sites[0] &&
      loginUrl(
        {
          ...item.project!,
          urls: sites.map((site) => site.url),
          login_path: sites[0].login_path ?? "",
        },
        sites[0].url
      )
  if (!target) throw new Error("Add a website to this login first")
  // A no-op when already granted; otherwise Chrome asks once for this site.
  if (
    !(await browser.permissions.request({
      origins: [new URL(target).origin + "/*"],
    }))
  )
    throw new Error("Site permission was not granted")
  await send({ type: "permissions-changed" })
  const result = await send<{ message: string }>(
    here
      ? {
          type: "manual",
          accountId: item.id,
          submit: options.submit,
          tabId: options.tabId,
        }
      : {
          type: "open-fill",
          accountId: item.id,
          submit: options.submit,
          windowId: options.windowId,
        }
  )
  return result.message
}

export const isMac = /Mac/i.test(navigator.platform || navigator.userAgent)
export const modKey = isMac ? "⌘" : "Ctrl"
