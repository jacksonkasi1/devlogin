import { useEffect, useRef, useState } from "react"
import { browser } from "wxt/browser"
import {
  accountMatches,
  accountWebsites,
  websiteMatches,
  loginUrl,
  type Account,
  type Project,
} from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { Toaster, toast } from "@workspace/ui/components/sonner"
import { ItemIcon } from "@workspace/ui/components/item-icon"
import {
  ProjectEditor,
  AccountEditor,
} from "@workspace/ui/components/credential-editors"
import {
  KeyRound,
  Plus,
  MoreHorizontal,
  Search,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  ArrowLeft,
} from "@workspace/ui/components/devlogin-icons"
import { PopupSettings } from "../../src/popup-settings"
import { LocalProject } from "../../src/local-project"
import { send } from "../../src/client"
import type { Snapshot } from "../../src/messages"

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [projectId, setProjectId] = useState("all")
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [view, setView] = useState("logins")
  const [editor, setEditor] = useState<"account" | "project" | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account>()
  const [editingProject, setEditingProject] = useState<Project>()
  const [deleting, setDeleting] = useState<{
    title: string
    path: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [revealed, setRevealed] = useState<{
    id: string
    value: string
  } | null>(null)
  const [origin, setOrigin] = useState(
    import.meta.env.VITE_API_ORIGIN ?? "https://devlogin.peacockindia.in"
  )
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") ?? "system"
  )
  const api = <T,>(path: string, method = "GET", body?: unknown) =>
    send<T>({ type: "api", path, method, body })
  async function refresh() {
    setBusy(true)
    try {
      const next = await send<Snapshot>({ type: "snapshot" })
      setSnapshot(next)
      setTheme(next.settings.theme)
      setOrigin(next.origin)
      setError("")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sync")
      setSnapshot((current) => (current ? { ...current, data: null } : null))
    } finally {
      setBusy(false)
    }
  }
  async function act(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    try {
      await action()
      if (success) toast.success(success)
      await refresh()
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : "Action failed"
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)")
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches)
      )
    localStorage.setItem("theme", theme)
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])
  const data = snapshot?.data
  const user = snapshot?.user
  const projects = data?.projects ?? []
  const project = projects.find((item) => item.id === projectId)
  const accounts = (data?.accounts ?? []).filter((item) => {
    const folder = projects.find((p) => p.id === item.project_id)
    return (
      (projectId === "all" || item.project_id === projectId) &&
      `${item.label} ${item.email} ${folder?.name ?? ""} ${accountWebsites(
        item,
        folder
      )
        .map((site) => site.url)
        .join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  })
  const account =
    accounts.find((item) => item.id === selected) ??
    accounts.find((item) => accountMatches(item, snapshot?.tabUrl ?? "")) ??
    accounts[0]
  const folder = projects.find((item) => item.id === account?.project_id)
  const visibleAccount = useRef(account?.id)
  visibleAccount.current = account?.id
  const password =
    revealed?.id === account?.id ? (revealed?.value ?? null) : null
  const websites = account ? accountWebsites(account, folder) : []
  useEffect(() => {
    setRevealed(null)
  }, [account?.id, account?.updated_at])
  useEffect(() => {
    if (password === null) return
    const timer = setTimeout(() => setRevealed(null), 30000)
    return () => clearTimeout(timer)
  }, [password])
  const copy = async (value: string, title: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${title} copied`)
    } catch {
      toast.error("Clipboard unavailable")
    }
  }
  const readPassword = async (copyValue = false) => {
    if (!account) return
    try {
      const result = await api<{ password: string }>(
        `/api/accounts/${account.id}/password`,
        "POST",
        {}
      )
      if (copyValue) await copy(result.password, "Password")
      else if (visibleAccount.current === account.id)
        setRevealed({ id: account.id, value: result.password })
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not retrieve password"
      )
    }
  }
  async function permission(wide = false) {
    try {
      if (
        !(await browser.permissions.request({
          origins: wide
            ? ["https://*/*", "http://*/*"]
            : [new URL(snapshot?.tabUrl ?? "").origin + "/*"],
        }))
      )
        throw new Error("Site permission was not granted")
      await send({ type: "permissions-changed" })
      await refresh()
      toast.success("Global Login enabled")
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not enable site"
      )
    }
  }
  const addAccount = () => {
    setEditingAccount(undefined)
    if (!projects.length) {
      setEditingProject(undefined)
      setEditor("project")
    } else setEditor("account")
  }
  const accountMenu = account && (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Login actions" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void copy(account.email, "Username")}>
          Copy username
        </DropdownMenuItem>
        {account.login_type === "password" && (
          <DropdownMenuItem onClick={() => void readPassword(true)}>
            Copy password
          </DropdownMenuItem>
        )}
        {user?.is_admin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setEditingAccount(account)
                setEditor("account")
              }}
            >
              Edit login
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                setDeleting({
                  title: `Delete ${account.label}?`,
                  path: `/api/accounts/${account.id}`,
                })
              }
            >
              Delete login
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <main className="popup-shell">
      <header className="popup-header">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="project-filter"
                aria-label="Project filter"
              />
            }
          >
            <KeyRound className="size-4 text-primary" />
            <span className="truncate">{project?.name ?? "All Projects"}</span>
            <ChevronDown className="ml-auto size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <DropdownMenuItem onClick={() => setProjectId("all")}>
              All Projects{" "}
              <span className="ml-auto text-muted-foreground">
                {data?.accounts.length ?? 0}
              </span>
            </DropdownMenuItem>
            {projects.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => setProjectId(item.id)}
              >
                <ItemIcon icon={item.icon} folder small />
                {item.name}
                <span className="ml-auto text-muted-foreground">
                  {
                    data?.accounts.filter((a) => a.project_id === item.id)
                      .length
                  }
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("projects")}>
              Manage Projects
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="Search logins…"
            aria-label="Search logins"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {user?.approved && user.is_admin && (
          <Button size="sm" disabled={busy} onClick={addAccount}>
            <Plus className="size-4" />
            Add Login
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Settings menu" />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="truncate px-2 py-2 text-xs text-muted-foreground">
              {user?.email ?? "Global Login"}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("settings")}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setView("projects")}>
              Manage Projects
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void browser.tabs.create({ url: origin })}
            >
              Open Web Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onClick={() => void refresh()}>
              Refresh
            </DropdownMenuItem>
            {snapshot?.tabUrl?.startsWith("http") && (
              <>
                <DropdownMenuItem onClick={() => void permission()}>
                  Enable Global Login on this site
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void act(() =>
                      send({
                        type: "exclude",
                        origin: new URL(snapshot.tabUrl).origin,
                        excluded: !snapshot.excluded?.includes(
                          new URL(snapshot.tabUrl).origin
                        ),
                      })
                    )
                  }
                >
                  {snapshot.excluded?.includes(new URL(snapshot.tabUrl).origin)
                    ? "Include"
                    : "Exclude"}{" "}
                  this website
                </DropdownMenuItem>
              </>
            )}
            {user && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    void act(() => send({ type: "logout" }), "Signed out")
                  }
                >
                  Sign Out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {error && (
        <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {view !== "logins" ? (
        <section className="popup-screen">
          <Button size="sm" variant="ghost" onClick={() => setView("logins")}>
            <ArrowLeft className="size-4" />
            Logins
          </Button>
          {view === "settings" ? (
            <>
              <PopupSettings
                user={user}
                origin={origin}
                setOrigin={setOrigin}
                theme={theme}
                setTheme={(value) => {
                  setTheme(value)
                  void act(() =>
                    send({
                      type: "ui-settings",
                      settings: { theme: value as "light" | "dark" | "system" },
                    })
                  )
                }}
                busy={busy}
                act={act}
                snapshot={snapshot}
                permission={permission}
              />
              <LocalProject snapshot={snapshot} busy={busy} act={act} />
              {folder && (
                <div className="flex items-center justify-between border-t py-3 text-sm">
                  <span>Auto-login · {folder.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        api("/api/preferences", "PUT", {
                          project_id: folder.id,
                          account_id: account?.id ?? null,
                          auto_login: !data?.preferences.find(
                            (p) => p.project_id === folder.id
                          )?.auto_login,
                        })
                      )
                    }
                  >
                    {data?.preferences.find((p) => p.project_id === folder.id)
                      ?.auto_login
                      ? "On"
                      : "Off"}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between py-4">
                <h2 className="font-semibold">Projects</h2>
                {user?.is_admin && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingProject(undefined)
                      setEditor("project")
                    }}
                  >
                    <Plus />
                    Create Project
                  </Button>
                )}
              </div>
              <div className="divide-y">
                {projects.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    <ItemIcon icon={item.icon} folder />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    {user?.is_admin && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingProject(item)
                            setEditor("project")
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDeleting({
                              title: `Delete ${item.name} and all its logins?`,
                              path: `/api/projects/${item.id}`,
                            })
                          }
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {!projects.length && (
                <p className="text-sm text-muted-foreground">
                  Create a project to organize your logins.
                </p>
              )}
            </>
          )}
        </section>
      ) : !user?.approved || !data ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <KeyRound className="size-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">
            {!user
              ? "Welcome to Global Login"
              : !user.approved
                ? "Waiting for approval"
                : "Connect to your logins"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {!user
              ? "Peacock Projects"
              : !user.approved
                ? `${user.email} requires administrator approval.`
                : "Refresh to sync your accounts."}
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              !user ? void act(() => send({ type: "login" })) : void refresh()
            }
          >
            {!user ? "Continue with Google" : "Refresh"}
          </Button>
        </section>
      ) : (
        <div className="vault-panels">
          <aside className="login-sidebar">
            <div className="flex items-center justify-between border-b px-4 py-3 text-xs">
              <span className="font-medium">
                {project?.name ?? "All Logins"}
              </span>
              <span className="text-muted-foreground">{accounts.length}</span>
            </div>
            <div className="login-scroll p-2">
              {accounts.map((item) => (
                <button
                  key={item.id}
                  aria-pressed={account?.id === item.id}
                  className={`login-row ${account?.id === item.id ? "selected" : ""}`}
                  onClick={() => setSelected(item.id)}
                >
                  <ItemIcon
                    icon={
                      item.icon ??
                      projects.find((p) => p.id === item.project_id)?.icon
                    }
                    website={
                      accountWebsites(
                        item,
                        projects.find((p) => p.id === item.project_id)
                      )[0]?.url
                    }
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {item.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.email}
                    </span>
                  </span>
                </button>
              ))}
              {!accounts.length && (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {search
                    ? "No logins match your search."
                    : "No saved logins yet."}
                </div>
              )}
            </div>
          </aside>
          <section className="login-details">
            {account ? (
              <>
                <div className="detail-toolbar">
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-xs text-muted-foreground">
                    <ItemIcon icon={folder?.icon} folder small />
                    {folder?.name}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !websites.length}
                    onClick={() =>
                      void act(async () => {
                        if (
                          !websites.some((site) =>
                            websiteMatches(site, snapshot?.tabUrl ?? "")
                          )
                        ) {
                          const url =
                            websites[0] &&
                            loginUrl(
                              {
                                ...folder!,
                                urls: websites.map((s) => s.url),
                                login_path: websites[0].login_path ?? "",
                              },
                              websites[0].url
                            )
                          if (url) {
                            if (
                              !(await browser.permissions.request({
                                origins: [new URL(url).origin + "/*"],
                              }))
                            )
                              throw new Error("Site permission was not granted")
                            await send({ type: "permissions-changed" })
                            const result = await send<{ message: string }>({
                              type: "open-fill",
                              accountId: account.id,
                              submit:
                                snapshot?.settings.submitAfterFill ?? false,
                            })
                            toast.success(result.message)
                          }
                        } else {
                          const result = await send<{ message: string }>({
                            type: "manual",
                            accountId: account.id,
                            submit: snapshot?.settings.submitAfterFill ?? false,
                          })
                          toast.success(result.message)
                        }
                      })
                    }
                  >
                    Open &amp; Fill
                  </Button>
                  {accountMenu}
                </div>
                <div className="detail-scroll p-6">
                  <div className="mb-6 flex items-center gap-3">
                    <ItemIcon
                      icon={account.icon}
                      website={websites[0]?.url}
                      large
                    />
                    <h1 className="min-w-0 text-xl font-semibold break-words">
                      {account.label}
                    </h1>
                  </div>
                  <div className="overflow-hidden rounded-lg border">
                    <div className="credential-field">
                      <div className="min-w-0 flex-1">
                        <p className="field-label">Username</p>
                        <p className="text-sm break-all">{account.email}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Copy username"
                        onClick={() => void copy(account.email, "Username")}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                    <div className="credential-field border-t">
                      <div className="min-w-0 flex-1">
                        <p className="field-label">Password</p>
                        <p className="font-mono text-sm break-all">
                          {account.login_type === "google"
                            ? "Google sign-in"
                            : (password ?? "••••••••••••")}
                        </p>
                      </div>
                      {account.login_type === "password" && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={
                              password === null
                                ? "Show password"
                                : "Hide password"
                            }
                            onClick={() =>
                              password === null
                                ? void readPassword()
                                : setRevealed(null)
                            }
                          >
                            {password === null ? (
                              <Eye className="size-4" />
                            ) : (
                              <EyeOff className="size-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Copy password"
                            onClick={() => void readPassword(true)}
                          >
                            <Copy className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 space-y-2">
                    <p className="field-label">Websites</p>
                    {websites.map((site) => (
                      <button
                        key={site.url}
                        className="block max-w-full cursor-pointer text-left text-sm break-all text-primary hover:underline"
                        onClick={() =>
                          void browser.tabs.create({ url: site.url })
                        }
                      >
                        {site.url}
                      </button>
                    ))}
                  </div>
                  {account.notes && (
                    <div className="mt-6">
                      <p className="field-label">Notes</p>
                      <p className="text-sm break-words whitespace-pre-wrap">
                        {account.notes}
                      </p>
                    </div>
                  )}
                  <p className="mt-8 text-xs text-muted-foreground">
                    Last updated {new Date(account.updated_at).toLocaleString()}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <KeyRound className="size-8 text-muted-foreground" />
                <h2 className="font-medium">
                  {search ? "No matching logins" : "Your logins, in one place"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {search
                    ? "Try another title, username, or website."
                    : "Add a login to get started."}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      <footer className="popup-footer">
        <span className="flex items-center gap-2">
          <span
            className={`size-1.5 rounded-full ${error ? "bg-destructive" : "bg-emerald-500"}`}
          />
          {busy ? "Syncing…" : error ? "Sync unavailable" : "Synced"}
        </span>
        <span className="flex flex-col items-end">
          <span>Global Login</span>
          <span className="text-[10px]">Peacock Projects</span>
        </span>
      </footer>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
      >
        <DialogContent className="compact-editor max-h-[510px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editor === "project"
                ? editingProject
                  ? "Edit project"
                  : "Create project"
                : editingAccount
                  ? "Edit login"
                  : "Add login"}
            </DialogTitle>
            <DialogDescription>
              {editor === "project"
                ? "Organize your logins."
                : "Save a login to your project."}
            </DialogDescription>
          </DialogHeader>
          {editor === "project" ? (
            <ProjectEditor
              key={editingProject?.id ?? "new"}
              project={editingProject}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={(body) =>
                void act(async () => {
                  const saved = await api<Project>(
                    editingProject
                      ? `/api/projects/${editingProject.id}`
                      : "/api/projects",
                    editingProject ? "PUT" : "POST",
                    body
                  )
                  setProjectId(saved.id)
                  setEditor(null)
                }, "Project saved")
              }
            />
          ) : (
            editor === "account" && (
              <AccountEditor
                key={editingAccount?.id ?? "new"}
                account={editingAccount}
                projectId={
                  editingAccount?.project_id ??
                  project?.id ??
                  snapshot?.matchedProjectId ??
                  projects[0]?.id ??
                  ""
                }
                projects={projects}
                website={
                  !editingAccount && snapshot?.tabUrl?.startsWith("http")
                    ? snapshot.tabUrl
                    : undefined
                }
                busy={busy}
                onCancel={() => setEditor(null)}
                onSave={(body) =>
                  void act(async () => {
                    const saved = await api<Account>(
                      editingAccount
                        ? `/api/accounts/${editingAccount.id}`
                        : "/api/accounts",
                      editingAccount ? "PUT" : "POST",
                      body
                    )
                    setProjectId(saved.project_id)
                    setSelected(saved.id)
                    setEditor(null)
                  }, "Login saved")
                }
              />
            )
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleting?.title}</DialogTitle>
            <DialogDescription>
              This removes the shared record for every user.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                deleting &&
                void act(async () => {
                  await api(deleting.path, "DELETE", {})
                  setDeleting(null)
                  setSelected(null)
                  setProjectId("all")
                }, "Deleted")
              }
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Toaster theme={theme as "light" | "dark" | "system"} />
    </main>
  )
}
