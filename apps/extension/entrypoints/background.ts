import { defineBackground } from "wxt/utils/define-background"
import { browser, type Browser } from "wxt/browser"
import {
  apiRequest,
  ApiError,
  isLoginPage,
  loginUrl,
  accountMatches,
  accountProject,
  siteProjects,
  type Sync,
  type User,
} from "@workspace/shared"
import type { Message, Context, Fill, Reply, Snapshot } from "../src/messages"
import {
  matchPage,
  localAddress,
  bindLocalProject,
} from "../src/local-identity"
import { pageActions } from "../src/page-actions"
import { readUiSettings, saveUiSettings } from "../src/ui-settings"
import { registerSites, forbidden } from "../src/site-permissions"
import { mountQuickAccess } from "../src/quick-mount"

export default defineBackground(() => {
  let cache: { data: Sync; at: number } | null = null
  const reservations = new Set<string>()
  const openingLogins = new Set<number>()
  // One-time Quick Access tokens bind an overlay to the tab it was opened over.
  const quickSessions = new Map<
    string,
    { tabId?: number; windowId?: number; embedded: boolean; expires: number }
  >()
  // The fallback Quick Access window behaves like Spotlight: one at a time, gone on blur.
  let quickWindow: number | undefined
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (quickWindow !== undefined && windowId !== quickWindow)
      void closeQuickWindow()
  })
  browser.windows.onRemoved.addListener((windowId) => {
    if (windowId === quickWindow) quickWindow = undefined
  })
  async function closeQuickWindow() {
    const id = quickWindow
    quickWindow = undefined
    if (id !== undefined) await browser.windows.remove(id).catch(() => {})
  }
  void registerSites().catch(() => {})
  browser.permissions.onAdded.addListener(() => {
    void registerSites().catch(() => {})
  })
  browser.permissions.onRemoved.addListener(() => {
    void registerSites().catch(() => {})
  })
  // Credentials and session tokens are never available through content-script storage.
  void browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
  async function configuration() {
    const stored = await browser.storage.local.get(["origin", "token"])
    return {
      origin: String(
        stored.origin ??
          import.meta.env.VITE_API_ORIGIN ??
          "https://devlogin.peacockindia.in"
      ).replace(/\/$/, ""),
      token: typeof stored.token === "string" ? stored.token : undefined,
    }
  }
  async function api<T>(path: string, options?: RequestInit): Promise<T> {
    const { origin, token } = await configuration()
    if (!token) throw new ApiError("Sign in to Global Login", 401)
    try {
      return await apiRequest<T>(origin, path, options, token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await browser.storage.local.remove("token")
        cache = null
      }
      if (error instanceof ApiError && error.status === 403) cache = null
      throw error
    }
  }
  async function sync(force = false) {
    if (!force && cache && Date.now() - cache.at < 30_000) return cache.data
    const data = await api<Sync>("/api/sync")
    cache = { data, at: Date.now() }
    return data
  }
  async function context(
    address: string,
    tabId: number,
    force = false
  ): Promise<Context> {
    if (openingLogins.has(tabId)) return null
    const config = await configuration()
    const { excluded = [] } = await browser.storage.local.get("excluded")
    if (forbidden(address, config.origin, excluded as string[])) return null
    if (
      !(await browser.permissions.contains({
        origins: [new URL(address).origin + "/*"],
      }))
    )
      return null
    const data = await sync(force || localAddress(address))
    const { project } = await matchPage(
      siteProjects(data, address),
      address,
      tabId
    )
    if (!project) return null
    const preference = data.preferences.find(
      (item) => item.project_id === project.id
    )
    if (!preference?.auto_login) return null
    const account =
      data.accounts.find(
        (item) =>
          item.project_id === project.id && item.id === preference.account_id
      ) ??
      data.accounts.find(
        (item) => item.project_id === project.id && item.is_default
      )
    return account &&
      accountMatches(account, address) &&
      isLoginPage(accountProject(project, account, address), address)
      ? {
          project: accountProject(project, account, address),
          account,
          preference,
        }
      : null
  }
  async function reserve(tabId: number, projectId: string, automatic: boolean) {
    const key = `attempt:${tabId}:${projectId}`
    if (reservations.has(key)) throw new Error("A login is already in progress")
    reservations.add(key)
    try {
      const state = await browser.storage.session.get(key)
      const previous = (state[key] ?? {
        last: 0,
        start: Date.now(),
        count: 0,
      }) as { last: number; start: number; count: number }
      if (Date.now() - previous.last < (automatic ? 60_000 : 5_000))
        throw new Error("A login was just attempted. Wait before trying again.")
      if (Date.now() - previous.start > 600_000) {
        previous.start = Date.now()
        previous.count = 0
      }
      if (automatic && previous.count >= 3)
        throw new Error(
          "Auto-login paused after repeated attempts. Use manual login."
        )
      await browser.storage.session.set({
        [key]: { ...previous, last: Date.now(), count: previous.count + 1 },
      })
    } finally {
      reservations.delete(key)
    }
  }
  async function automatic(
    message: Extract<Message, { type: "automatic" }>,
    sender: Browser.runtime.MessageSender
  ): Promise<Fill | null> {
    if (!sender.tab?.id || sender.frameId !== 0 || !sender.url) return null
    const current = await context(sender.url, sender.tab.id, true)
    if (
      !current ||
      current.project.id !== message.projectId ||
      current.account.id !== message.accountId
    )
      return null
    const tab = await browser.tabs.get(sender.tab.id)
    if (
      !tab.url ||
      !isLoginPage(current.project, tab.url) ||
      !accountMatches(current.account, tab.url)
    )
      return null
    await reserve(sender.tab.id, current.project.id, true)
    const matched = await matchPage(
      siteProjects(await sync(), sender.url),
      sender.url,
      sender.tab.id
    )
    if (matched.project?.id !== current.project.id) return null
    const password =
      current.account.login_type === "password"
        ? (
            await api<{ password: string }>(
              `/api/accounts/${current.account.id}/password`,
              { method: "POST", body: "{}" }
            )
          ).password
        : ""
    return {
      type: "fill",
      project: current.project,
      account: current.account,
      password,
      submit: true,
      automatic: true,
      identity: matched.identity,
    }
  }
  const pageHandle = pageActions({
    reserve,
    sync,
    api,
    configuration,
    invalidate: () => {
      cache = null
    },
  })
  async function snapshot(tab?: Browser.tabs.Tab): Promise<Snapshot> {
    const { origin, token } = await configuration()
    let user: User | null = null
    let data: Sync | null = null
    // Local reads and both API calls run in parallel: opening stays one round trip.
    const local = Promise.all([
      browser.permissions.getAll(),
      browser.storage.local.get("excluded"),
      browser.commands.getAll().catch(() => []),
    ])
    if (token) {
      const synced = sync(true)
      synced.catch(() => {})
      try {
        user = await api<User>("/api/me")
        if (user.approved) data = await synced
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error
      }
    }
    const [{ origins = [] }, { excluded = [] }, commands] = await local
    return {
      origin,
      user,
      data,
      tabUrl: tab?.url ?? "",
      tabId: tab?.id,
      windowId: tab?.windowId,
      shortcut:
        commands.find((command) => command.name === "quick-access")?.shortcut ||
        undefined,
      monitoring: origins.includes("https://*/*"),
      settings: await readUiSettings(),
      matchedProjectId:
        data && tab?.id && tab.url
          ? ((
              await matchPage(
                siteProjects(data, tab.url),
                tab.url,
                tab.id
              ).catch(() => ({ project: undefined }))
            ).project?.id ?? null)
          : null,
      excluded: excluded as string[],
    }
  }
  async function openQuickAccess(tab?: Browser.tabs.Tab) {
    for (const [key, value] of quickSessions)
      if (value.expires < Date.now()) quickSessions.delete(key)
    // Pressing the shortcut again toggles the fallback window off.
    if (quickWindow !== undefined) return closeQuickWindow()
    tab ??= (await browser.tabs.query({ active: true, currentWindow: true }))[0]
    const token = crypto.randomUUID()
    const session = {
      tabId: tab?.id,
      windowId: tab?.windowId,
      embedded: true,
      expires: Date.now() + 60_000,
    }
    quickSessions.set(token, session)
    const page = browser.runtime.getURL("/quick.html")
    // The shortcut grants activeTab, so the overlay works on any normal page.
    // The token travels by postMessage to the extension origin, never in the frame URL.
    if (tab?.id && tab.url && /^https?:/.test(tab.url)) {
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: mountQuickAccess,
          args: [page, token],
        })
        return
      } catch {
        /* Restricted pages fall back to a small centered window. */
      }
    }
    session.embedded = false
    const parent = tab?.windowId
      ? await browser.windows.get(tab.windowId).catch(() => undefined)
      : undefined
    const width = 720
    const height = 480
    const created = await browser.windows.create({
      url: `${page}?window=1#${token}`,
      type: "popup",
      width,
      height,
      focused: true,
      ...(parent?.left !== undefined && parent.width && parent.height
        ? {
            left: Math.max(
              0,
              Math.round(parent.left + (parent.width - width) / 2)
            ),
            top: Math.max(
              0,
              Math.round((parent.top ?? 0) + parent.height * 0.15)
            ),
          }
        : {}),
    })
    quickWindow = created?.id
  }
  browser.commands.onCommand.addListener((command, tab) => {
    if (command === "quick-access") void openQuickAccess(tab)
  })
  // Only extension contexts can reach the service-worker global; used by browser tests.
  Object.assign(globalThis, { openQuickAccess })
  async function handle(
    message: Message,
    sender: Browser.runtime.MessageSender,
    targetTab?: Browser.tabs.Tab
  ): Promise<unknown> {
    if (sender.id !== browser.runtime.id) throw new Error("Untrusted sender")
    const trusted = sender.url?.startsWith(browser.runtime.getURL("/"))
    if (!trusted) {
      if (
        message.type === "context" &&
        sender.tab &&
        sender.frameId === 0 &&
        sender.url
      )
        return context(sender.url, sender.tab.id!)
      if (message.type === "automatic") return automatic(message, sender)
      if (
        [
          "page",
          "suggest-fill",
          "observe",
          "pending",
          "confirm",
          "dismiss",
          "manage",
        ].includes(message.type)
      )
        return pageHandle.handle(message, sender)
      throw new Error("This action is only available in the extension popup")
    }
    switch (message.type) {
      case "identify-local": {
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        })
        if (!tab?.id || !tab.url) throw new Error("No active local website")
        const project = siteProjects(await sync(true), tab.url).find(
          (item) => item.id === message.projectId
        )
        if (!project) throw new Error("Project not found")
        const result = await bindLocalProject(project, tab.url, tab.id)
        await browser.tabs
          .sendMessage(tab.id, { type: "local-identity-changed" })
          .catch(() => {})
        return result
      }
      case "ui-settings":
        return saveUiSettings(message.settings)
      case "permissions-changed":
        await registerSites()
        return null
      case "exclude": {
        pageHandle.clear()
        const { excluded = [] } = await browser.storage.local.get("excluded")
        const address = new URL(message.origin).origin
        await browser.storage.local.set({
          excluded: message.excluded
            ? [...new Set([...(excluded as string[]), address])]
            : (excluded as string[]).filter((value) => value !== address),
        })
        return null
      }
      case "login": {
        const { origin } = await configuration()
        const status = await apiRequest<{
          configured: boolean
          extension_allowed?: boolean
        }>(
          origin,
          `/api/auth/status?${new URLSearchParams({ extension_id: browser.runtime.id })}`
        )
        if (!status.configured)
          throw new Error("Google OAuth is not configured on this backend")
        if (status.extension_allowed === false)
          throw new Error(
            `This extension ID (${browser.runtime.id}) is not allowed by the backend. Add it to EXTENSION_IDS and deploy the backend, or install the latest Global Login build.`
          )
        const bytes = crypto.getRandomValues(new Uint8Array(32))
        const verifier = btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "")
        const digest = new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier)
          )
        )
        const challenge = btoa(String.fromCharCode(...digest))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "")
        const url = `${origin}/api/auth/google?${new URLSearchParams({ redirect_uri: browser.identity.getRedirectURL(), code_challenge: challenge })}`
        const result = await browser.identity.launchWebAuthFlow({
          url,
          interactive: true,
        })
        if (
          !result ||
          new URL(result).origin !==
            new URL(browser.identity.getRedirectURL()).origin
        )
          throw new Error("Google sign-in was cancelled")
        const code = new URL(result).searchParams.get("code")
        if (!code)
          throw new Error(
            "Google sign-in failed. Check OAuth settings and the extension ID."
          )
        const { token } = await apiRequest<{ token: string }>(
          origin,
          "/api/auth/exchange",
          { method: "POST", body: JSON.stringify({ code, verifier }) }
        )
        await browser.storage.local.set({ token })
        cache = null
        return { ok: true }
      }
      case "logout":
        pageHandle.clear()
        try {
          await api("/api/auth/logout", { method: "POST", body: "{}" })
        } finally {
          await browser.storage.local.remove("token")
          cache = null
        }
        return { ok: true }
      case "configure": {
        pageHandle.clear()
        const parsed = new URL(message.origin)
        if (
          parsed.origin !== message.origin.replace(/\/$/, "") ||
          !(
            parsed.protocol === "https:" ||
            (parsed.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(parsed.hostname))
          )
        )
          throw new Error("Use a HTTPS origin, or HTTP localhost")
        await browser.storage.local.set({ origin: parsed.origin })
        await browser.storage.local.remove("token")
        cache = null
        return { ok: true }
      }
      case "snapshot": {
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        })
        return snapshot(tab)
      }
      case "quick-session": {
        const session = quickSessions.get(message.token)
        // Only the overlay frame in the original tab (or the top-level fallback
        // window) may redeem a token, so a page framing quick.html gets nothing.
        if (
          !session ||
          session.expires < Date.now() ||
          (session.embedded
            ? sender.tab?.id !== session.tabId || !sender.frameId
            : sender.frameId !== 0)
        )
          throw new Error("Quick Access expired. Press the shortcut again.")
        quickSessions.delete(message.token)
        const tab = session.tabId
          ? await browser.tabs.get(session.tabId).catch(() => undefined)
          : undefined
        return { ...(await snapshot(tab)), windowId: session.windowId }
      }
      case "api": {
        if (
          !/^\/api\/(?:(?:projects|preferences)(?:\/[a-zA-Z0-9-]+)?|accounts(?:\/[a-zA-Z0-9-]+(?:\/password)?)?|notes(?:\/[a-zA-Z0-9-]+(?:\/content)?)?)$/.test(
            message.path
          )
        )
          throw new Error("Unsupported API path")
        const result = await api(message.path, {
          method: message.method ?? "GET",
          ...(message.body !== undefined
            ? { body: JSON.stringify(message.body) }
            : {}),
        })
        if (message.method && message.method !== "GET") cache = null
        return result
      }
      case "open-fill": {
        const data = await sync(true)
        const account = data.accounts.find(
          (item) => item.id === message.accountId
        )
        const folder = data.projects.find(
          (item) => item.id === account?.project_id
        )
        if (!account || !folder) throw new Error("Login no longer exists")
        const project = accountProject(folder, account)
        if (!project.urls.length)
          throw new Error("Add a website to this login first")
        const url = loginUrl(project, project.urls[0]!)
        const { excluded = [] } = await browser.storage.local.get("excluded")
        if (
          forbidden(url, (await configuration()).origin, excluded as string[])
        )
          throw new Error("Global Login is disabled on this website")
        if (
          !(await browser.permissions.contains({
            origins: [new URL(url).origin + "/*"],
          }))
        )
          throw new Error("Enable Global Login on the saved website first")
        await registerSites()
        const tab = await browser.tabs.create({
          url,
          ...(message.windowId ? { windowId: message.windowId } : {}),
        })
        if (!tab.id) throw new Error("Could not open website")
        openingLogins.add(tab.id)
        try {
          // Wait for the registered content script, then use the same guarded fill flow.
          for (let attempt = 0; attempt < 40; attempt++) {
            const current = await browser.tabs.get(tab.id)
            if (current.status === "complete") {
              await new Promise((resolve) => setTimeout(resolve, 250))
              return await handle(
                { ...message, type: "manual" },
                sender,
                current
              )
            }
            await new Promise((resolve) => setTimeout(resolve, 250))
          }
          throw new Error(
            "Website is still loading. Open Global Login there to fill."
          )
        } finally {
          openingLogins.delete(tab.id)
        }
      }
      case "manual": {
        const data = await sync(true)
        const account = data.accounts.find(
          (item) => item.id === message.accountId
        )
        const folder = data.projects.find(
          (item) => item.id === account?.project_id
        )
        const project =
          folder && account ? accountProject(folder, account) : undefined
        if (!account || !project)
          throw new Error("Account no longer exists. Refresh and try again.")
        const tab =
          targetTab ??
          (message.tabId
            ? await browser.tabs.get(message.tabId).catch(() => undefined)
            : (
                await browser.tabs.query({ active: true, currentWindow: true })
              )[0])
        if (!tab?.id || !tab.url) throw new Error("No active website")
        const { excluded = [] } = await browser.storage.local.get("excluded")
        if (
          forbidden(
            tab.url,
            (await configuration()).origin,
            excluded as string[]
          )
        )
          throw new Error("Global Login is disabled on this website")
        if (!accountMatches(account, tab.url))
          throw new Error("Account belongs to another environment")
        if (
          !(await browser.permissions.contains({
            origins: [new URL(tab.url).origin + "/*"],
          }))
        )
          throw new Error("Enable Global Login on this site first")
        const matched = await matchPage(
          siteProjects(data, tab.url),
          tab.url,
          tab.id
        )
        if (localAddress(tab.url) && matched.project?.id !== project.id)
          throw new Error(
            "Local project identity does not match. Identify this local project in Settings first."
          )
        if (
          !isLoginPage(accountProject(project, account, tab.url), tab.url) ||
          (localAddress(tab.url) && matched.project?.id !== project.id)
        ) {
          const environment =
            project.urls.find(
              (value) => new URL(value).origin === new URL(tab.url!).origin
            ) ?? project.urls[0]!
          await browser.tabs.create({ url: loginUrl(project, environment) })
          return {
            message:
              "Login page opened. Open Global Login there and choose Login.",
          }
        }
        if (message.submit) await reserve(tab.id, project.id, false)
        const password =
          account.login_type === "password"
            ? (
                await api<{ password: string }>(
                  `/api/accounts/${account.id}/password`,
                  { method: "POST", body: "{}" }
                )
              ).password
            : ""
        const result = (await browser.tabs.sendMessage(tab.id, {
          type: "fill",
          project: accountProject(project, account, tab.url),
          account,
          password,
          submit: message.submit,
          identity: matched.identity,
        } satisfies Fill)) as Reply<string>
        if (!result?.ok)
          throw new Error(
            result && !result.ok ? result.error : "Form could not be filled"
          )
        return { message: result.data }
      }
      default:
        throw new Error("Unsupported action")
    }
  }
  browser.runtime.onMessage.addListener((message: Message, sender, respond) => {
    void handle(message, sender).then(
      (data) => respond({ ok: true, data }),
      (error) =>
        respond({
          ok: false,
          error: error instanceof Error ? error.message : "Action failed",
          status: error instanceof ApiError ? error.status : 500,
        })
    )
    return true
  })
  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session
      .get(null)
      .then((state) =>
        browser.storage.session.remove(
          Object.keys(state).filter((key) =>
            key.startsWith(`attempt:${tabId}:`)
          )
        )
      )
  })
})
