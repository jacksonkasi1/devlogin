import { browser, type Browser } from "wxt/browser"
import {
  accountMatches,
  accountProject,
  siteProjects,
  normalizeWebsite,
  submissionSchema,
  type Account,
  type Project,
  type Sync,
} from "@workspace/shared"
import { matchPage, localAddress } from "./local-identity"
import { forbidden } from "./site-permissions"
import { readUiSettings } from "./ui-settings"
import type { Fill, Message, PageContext, Pending } from "./messages"

type Candidate = Pending & { password: string; tabId: number; origin: string }
export function pageActions(deps: {
  sync: (force?: boolean) => Promise<Sync>
  api: <T>(path: string, options?: RequestInit) => Promise<T>
  configuration: () => Promise<{ origin: string }>
  invalidate: () => void
  reserve: (
    tabId: number,
    projectId: string,
    automatic: boolean
  ) => Promise<void>
}) {
  // Secrets live only in service-worker memory, expire in two minutes, and are
  // lost on a service-worker restart. No form values go into extension storage.
  const candidates = new Map<number, Candidate>()
  const saving = new Set<number>()
  const prune = () => {
    for (const [id, value] of candidates)
      if (value.expires < Date.now()) candidates.delete(id)
  }
  setInterval(prune, 15_000)
  browser.tabs.onRemoved.addListener((id) => candidates.delete(id))
  async function page(
    sender: Browser.runtime.MessageSender
  ): Promise<PageContext> {
    if (sender.frameId !== 0 || !sender.tab?.id || !sender.url)
      throw new Error("Unsupported page")
    const { origin } = await deps.configuration()
    const { excluded = [] } = await browser.storage.local.get("excluded")
    if (forbidden(sender.url, origin, excluded as string[]))
      throw new Error("DevLogin is disabled on this website")
    if (
      !(await browser.permissions.contains({
        origins: [new URL(sender.url).origin + "/*"],
      }))
    )
      throw new Error("Enable DevLogin on this site first")
    const data = await deps.sync(localAddress(sender.url))
    const matched = await matchPage(
      siteProjects(data, sender.url),
      sender.url,
      sender.tab.id
    )
    const project = matched.project ?? null
    const me = await deps.api<{ is_admin: boolean; approved: boolean }>(
      "/api/me"
    )
    if (!me.approved) {
      candidates.delete(sender.tab.id)
      deps.invalidate()
      throw new Error("Administrator approval is required")
    }
    return {
      settings: await readUiSettings(),
      project,
      accounts: project
        ? data.accounts.filter(
            (a) =>
              (!localAddress(sender.url!) || a.project_id === project.id) &&
              accountMatches(a, sender.url!)
          )
        : [],
      admin: me.is_admin,
    }
  }
  async function instruction(
    account: Account,
    project: Project
  ): Promise<Fill> {
    const password =
      account.login_type === "password"
        ? (
            await deps.api<{ password: string }>(
              `/api/accounts/${account.id}/password`,
              { method: "POST", body: "{}" }
            )
          ).password
        : ""
    return { type: "fill", account, project, password, submit: false }
  }
  async function handle(
    message: Message,
    sender: Browser.runtime.MessageSender
  ) {
    prune()
    const context = await page(sender)
    const tabId = sender.tab!.id!
    switch (message.type) {
      case "page":
        return context
      case "manage":
        await browser.tabs.create({ url: (await deps.configuration()).origin })
        return null
      case "suggest-fill": {
        const account = context.accounts.find((a) => a.id === message.accountId)
        if (!account || !context.project)
          throw new Error("Account does not match this website")
        const matched = await matchPage(
          siteProjects(await deps.sync(), sender.url),
          sender.url!,
          tabId
        )
        if (
          localAddress(sender.url!) &&
          matched.project?.id !== account.project_id
        )
          throw new Error(
            "Project identity changed. Focus the login field again."
          )
        const folder = (await deps.sync()).projects.find(
          (p) => p.id === account.project_id
        )
        if (!folder) throw new Error("Project no longer exists")
        const fill = await instruction(
          account,
          accountProject(folder, account, sender.url)
        )
        fill.identity = matched.identity
        fill.submit = context.settings.submitAfterFill
        fill.submitIfValid = true
        if (fill.submit) await deps.reserve(tabId, context.project.id, false)
        return fill
      }
      case "observe": {
        if (!context.admin || saving.has(tabId)) return null
        const input = submissionSchema.parse(message)
        const passwordAccounts = context.accounts.filter(
          (a) => a.login_type === "password"
        )
        const matches = input.email
          ? passwordAccounts.filter(
              (a) => a.email.toLowerCase() === input.email.toLowerCase()
            )
          : input.kind === "change"
            ? passwordAccounts
            : []
        if (!input.email && !matches.length) return null
        if (matches.length === 1) {
          const saved = await instruction(matches[0]!, context.project!)
          if (saved.password === input.password) return null
        }
        const current = candidates.get(tabId)
        if (
          current &&
          current.password === input.password &&
          current.email === input.email
        )
          return null
        const candidate: Candidate = {
          id: crypto.randomUUID(),
          project: context.project,
          projects: (await deps.sync()).projects,
          website: sender.url!,
          email: input.email,
          matches,
          kind: input.kind,
          expires: Date.now() + 120_000,
          password: input.password,
          tabId,
          origin: new URL(sender.url!).origin,
        }
        candidates.set(tabId, candidate)
        return { id: candidate.id }
      }
      case "pending": {
        const candidate = candidates.get(tabId)
        if (
          !candidate ||
          candidate.origin !== new URL(sender.url!).origin ||
          !context.admin
        )
          return null
        const {
          password: _password,
          tabId: _tab,
          origin: _origin,
          ...metadata
        } = candidate
        return metadata
      }
      case "dismiss":
        if (candidates.get(tabId)?.id === message.id) candidates.delete(tabId)
        return null
      case "confirm": {
        if (saving.has(tabId)) throw new Error("Save already in progress")
        saving.add(tabId)
        try {
          const candidate = candidates.get(tabId)
          if (
            !context.admin ||
            !candidate ||
            candidate.id !== message.id ||
            candidate.origin !== new URL(sender.url!).origin
          )
            throw new Error("Confirmation expired. Submit the form again.")
          if (candidate.project?.id !== context.project?.id)
            throw new Error("Project changed. Submit the form again.")
          let project =
            message.projectId === null
              ? null
              : message.projectId
                ? ((await deps.sync(true)).projects.find(
                    (p) => p.id === message.projectId
                  ) ?? null)
                : context.project
          if (message.projectId && !project)
            throw new Error("Project no longer exists")
          if (!project) {
            project = await deps.api<Project>("/api/projects", {
              method: "POST",
              body: JSON.stringify({
                name:
                  message.projectName?.trim() ||
                  new URL(candidate.website).host,
              }),
            })
            candidate.project = project
          }
          const account = candidate.matches.length
            ? context.accounts.find(
                (a) =>
                  a.id === message.accountId &&
                  candidate.matches.some((m) => m.id === a.id)
              )
            : undefined
          if (candidate.matches.length && !account)
            throw new Error("Choose the account to update")
          const body = account
            ? { ...account, password: candidate.password }
            : {
                project_id: project.id,
                label: message.label?.trim() || candidate.email,
                email: candidate.email,
                password: candidate.password,
                environment: "",
                websites: [{ url: normalizeWebsite(candidate.origin) }],
                login_type: "password",
                is_default: false,
              }
          await deps.api(
            account ? `/api/accounts/${account.id}` : "/api/accounts",
            { method: account ? "PUT" : "POST", body: JSON.stringify(body) }
          )
          candidates.delete(tabId)
          deps.invalidate()
          return null
        } finally {
          saving.delete(tabId)
        }
      }
      default:
        throw new Error("Unsupported page action")
    }
  }
  return {
    handle,
    clear() {
      candidates.clear()
    },
  }
}
