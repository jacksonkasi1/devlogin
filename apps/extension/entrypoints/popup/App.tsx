import { configureIconBackend } from "@workspace/shared"
import { groupsFor, orderLogins, type SortOrder } from "@workspace/shared"
import {
  OrganizationMenu,
  LoginActivity,
} from "@workspace/ui/components/organization"
import { openTools } from "../../src/tools-window"
import { ItemMenu } from "@workspace/ui/components/item-menu"
import { refreshWebsiteIcons, type RefreshPage } from "@workspace/shared"
import { useEffect, useRef, useState } from "react"
import { browser } from "wxt/browser"
import {
  accountMatches,
  accountWebsites,
  websiteMatches,
  type Account,
  type Project,
} from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { AppearanceToggle } from "@workspace/ui/components/appearance-toggle"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
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
import { ProjectEditor } from "@workspace/ui/components/credential-editors"
import {
  KeyRound,
  Plus,
  MoreHorizontal,
  ChevronDown,
  Eye,
  EyeOff,
  ArrowLeft,
} from "@workspace/ui/components/devlogin-icons"
import {
  CredentialRow,
  LoginActions,
  LoginHeading,
  LoginRow,
  VaultMark,
  VaultSearch,
  copyCredential,
} from "@workspace/ui/components/vault"
import { PopupSettings } from "../../src/popup-settings"
import { LocalProject } from "../../src/local-project"
import { openSetup, SetupChecklist } from "../../src/setup-checklist"
import { Onboarding } from "../../src/onboarding"
import { useExtensionTheme } from "../../src/extension-theme"
import {
  openLoginWindow,
  savedLoginKey,
  type SavedLogin,
} from "../../src/login-window"
import { send } from "../../src/client"
import type { Snapshot } from "../../src/messages"

const orgRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  send<T>({ type: "api", path, method, body })
export function App() {
  const [group, setGroup] = useState("")
  const [sort, setSort] = useState<SortOrder>(
    () => (localStorage.getItem("login-sort") as SortOrder) ?? "priority"
  )

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [projectId, setProjectId] = useState("all")
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [view, setView] = useState("logins")
  const [editor, setEditor] = useState<"project" | null>(null)
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
      configureIconBackend(next.origin)
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
  useExtensionTheme(theme)
  useEffect(() => {
    localStorage.setItem("theme", theme)
  }, [theme])
  useEffect(() => {
    const showSaved = (saved: SavedLogin | undefined) => {
      if (!saved) return
      setProjectId(saved.project_id)
      setSelected(saved.id)
      setSearch("")
      void browser.storage.session.remove(savedLoginKey).catch(() => {})
    }
    const onChange = (
      changes: Record<string, { newValue?: unknown }>,
      area: string
    ) => {
      if (area !== "session" || !changes[savedLoginKey]?.newValue) return
      showSaved(changes[savedLoginKey].newValue as SavedLogin)
      void refresh()
    }
    browser.storage.onChanged.addListener(onChange)
    void browser.storage.session
      .get(savedLoginKey)
      .then((stored) => {
        showSaved(stored[savedLoginKey] as SavedLogin | undefined)
      })
      .catch(() => {})
    return () => browser.storage.onChanged.removeListener(onChange)
  }, [])
  const data = snapshot?.data
  const user = snapshot?.user
  const canEdit = !!user && (user.is_admin || user.can_edit)
  const projects = data?.projects ?? []
  const project = projects.find((item) => item.id === projectId)
  const filtered = (data?.accounts ?? []).filter((item) => {
    const folder = projects.find((p) => p.id === item.project_id)
    return (
      (!group ||
        groupsFor(item, folder, data?.collections).some(
          (g) => g.id === group
        )) &&
      (projectId === "all" || item.project_id === projectId) &&
      `${groupsFor(item, folder, data?.collections)
        .map((g) => g.name)
        .join(
          " "
        )} ${item.label} ${item.email} ${(item.tags ?? []).join(" ")} ${(folder?.tags ?? []).join(" ")} ${folder?.name ?? ""} ${accountWebsites(
        item,
        folder
      )
        .map((site) => site.url)
        .join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  })
  const accounts = orderLogins(filtered, sort, (a) => {
    const folder = projects.find((p) => p.id === a.project_id)
    const sites = accountWebsites(a, folder).filter(
      (s) => snapshot?.tabUrl && websiteMatches(s, snapshot.tabUrl)
    )
    return sites.length
      ? 1000 +
          Math.max(...sites.map((s) => new URL(s.url).pathname.length)) +
          ((snapshot?.pageTitle ?? "")
            .toLowerCase()
            .includes(a.label.toLowerCase())
            ? 20
            : 0)
      : 0
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
  const readPassword = async (copyValue = false) => {
    if (!account) return
    try {
      const result = await api<{ password: string }>(
        `/api/accounts/${account.id}/password`,
        "POST",
        {}
      )
      if (copyValue) await copyCredential(result.password, "Password")
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
  const addAccount = () => {
    if (!projects.length) {
      setEditingProject(undefined)
      setEditor("project")
    } else {
      void openLoginWindow({
        projectId: project?.id ?? snapshot?.matchedProjectId ?? projects[0]?.id,
        tabId: snapshot?.tabId,
      }).catch((failure) => toast.error(failure.message))
    }
  }
  const fillLogin = (item: Account) => {
    const project = projects.find((entry) => entry.id === item.project_id)
    const sites = accountWebsites(item, project)
    if (!project || !sites.length) return
    const type = sites.some((site) =>
      websiteMatches(site, snapshot?.tabUrl ?? "")
    )
      ? "manual"
      : "open-fill"
    void act(async () => {
      const result = await send<{ message: string }>({
        type,
        accountId: item.id,
        submit: snapshot?.settings.submitAfterFill ?? false,
      })
      toast.success(result.message)
    })
  }
  function refetchIcons(id?: string) {
    void act(async () => {
      const message = await refreshWebsiteIcons(
        (body) =>
          send<RefreshPage>({
            type: "api",
            path: "/api/favicons/refresh",
            method: "POST",
            body,
          }),
        id
      )
      toast.success(message)
    })
  }
  const accountMenu = account && (
    <LoginActions
      onRefreshIcon={
        canEdit && !account.icon ? () => refetchIcons(account.id) : undefined
      }
      onCopyUsername={() => void copyCredential(account.email, "Username")}
      onCopyPassword={
        account.login_type === "password"
          ? () => void readPassword(true)
          : undefined
      }
      onEdit={
        canEdit
          ? () => {
              void openLoginWindow({ accountId: account.id }).catch((failure) =>
                toast.error(failure.message)
              )
            }
          : undefined
      }
      onDelete={
        canEdit
          ? () =>
              setDeleting({
                title: `Delete ${account.label}?`,
                path: `/api/accounts/${account.id}`,
              })
          : undefined
      }
    />
  )
  return (
    <main className="popup-shell">
      <header
        className={`popup-header vault-header ${snapshot && !user ? "hidden" : ""}`}
      >
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
            <VaultMark />
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
        <VaultSearch
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <AppearanceToggle
          disabled={busy || !snapshot}
          onChange={(theme) =>
            void act(() => send({ type: "ui-settings", settings: { theme } }))
          }
        />
        {user?.approved && (
          <ItemMenu
            compact
            onLogin={canEdit ? addAccount : undefined}
            onCategory={(kind) =>
              void openTools(kind, snapshot?.tabId, snapshot?.tabUrl)
            }
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Settings menu"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="truncate px-2 py-2 text-xs text-muted-foreground">
              {user?.email ?? "Global Login"}
            </div>
            <DropdownMenuSeparator />
            {user?.approved && (
              <>
                <DropdownMenuItem onClick={() => void openTools("generator")}>
                  Tools · Password generator
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void openTools("browse", snapshot?.tabId, snapshot?.tabUrl)
                  }
                >
                  My private vault
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void browser.tabs.create({ url: origin + "/#files" })
                  }
                >
                  File attachments
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void browser.tabs.create({
                      url: "https://10minutemail.com/",
                    })
                  }
                >
                  Temporary inbox ↗
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onClick={() =>
                void browser.tabs.create({
                  url: new URL("/releases.html", origin).href,
                })
              }
            >
              What’s new
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void act(openSetup)}>
              Extension setup
            </DropdownMenuItem>
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
            {canEdit && (
              <DropdownMenuItem disabled={busy} onClick={() => refetchIcons()}>
                Refetch all favicons
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={busy} onClick={() => void refresh()}>
              Refresh
            </DropdownMenuItem>
            {snapshot?.tabUrl?.startsWith("http") && (
              <>
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
      {user && <SetupChecklist snapshot={snapshot} busy={busy} act={act} />}
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
                {canEdit && (
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
                    {canEdit && (
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
        !user ? (
          <Onboarding busy={busy} act={act} />
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <KeyRound className="size-8 text-muted-foreground" />
            <h1 className="text-lg font-semibold">
              {!user.approved
                ? "Waiting for approval"
                : "Connect to your logins"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {!user.approved
                ? `${user.email} requires administrator approval.`
                : "Refresh to sync your accounts."}
            </p>
            <Button disabled={busy} onClick={() => void refresh()}>
              Refresh
            </Button>
          </section>
        )
      ) : (
        <div className="vault-panels">
          <aside className="login-sidebar">
            <div className="vault-pane-bar flex items-center justify-between px-4 text-xs">
              <span className="font-medium">
                {data?.collections?.find((g) => g.id === group)?.name ??
                  project?.name ??
                  "All Logins"}
              </span>
              <OrganizationMenu
                sort={sort}
                onSort={(value) => {
                  setSort(value)
                  localStorage.setItem("login-sort", value)
                }}
                groups={data?.collections ?? []}
                group={group}
                change={setGroup}
                request={orgRequest}
                editable={canEdit}
                refresh={refresh}
              />
              <span className="text-muted-foreground">{accounts.length}</span>
            </div>
            <ScrollArea className="login-scroll min-h-0 flex-1">
              <div className="p-2">
                {accounts.map((item) => {
                  const project = projects.find((p) => p.id === item.project_id)
                  const website = accountWebsites(item, project)[0]?.url
                  return (
                    <LoginRow
                      key={item.id}
                      name={item.label}
                      username={item.email}
                      icon={item.icon ?? project?.icon}
                      website={website}
                      favicon={item.favicon}
                      action={
                        website && (
                          <Button
                            size="xs"
                            variant="ghost"
                            aria-label={`Open & Fill ${item.label} (${item.email})`}
                            disabled={busy}
                            onClick={() => fillLogin(item)}
                          >
                            Open &amp; Fill
                          </Button>
                        )
                      }
                      aria-pressed={account?.id === item.id}
                      onClick={() => setSelected(item.id)}
                    />
                  )
                })}
                {!accounts.length && (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {search
                      ? "No logins match your search."
                      : "No saved logins yet."}
                  </div>
                )}
              </div>
            </ScrollArea>
          </aside>
          <section className="login-details">
            {account ? (
              <>
                <div className="vault-pane-bar detail-toolbar">
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-xs text-muted-foreground">
                    <ItemIcon icon={folder?.icon} folder small />
                    {folder?.name}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="fill-action"
                    disabled={busy || !websites.length}
                    onClick={() => fillLogin(account)}
                  >
                    Open &amp; Fill
                  </Button>
                  {accountMenu}
                </div>
                <ScrollArea className="detail-scroll min-h-0 flex-1">
                  <div className="vault-detail">
                    <LoginHeading
                      title={account.label}
                      icon={account.icon}
                      website={websites[0]?.url}
                      favicon={account.favicon}
                    />
                    <div className="vault-credentials">
                      <CredentialRow
                        label="Username"
                        onCopy={() =>
                          void copyCredential(account.email, "Username")
                        }
                      >
                        {account.email}
                      </CredentialRow>
                      {account.login_type === "password" ? (
                        <CredentialRow
                          label="Password"
                          onCopy={() => void readPassword(true)}
                          action={
                            <Button
                              size="icon-sm"
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
                              {password === null ? <Eye /> : <EyeOff />}
                            </Button>
                          }
                        >
                          {password ?? "••••••••••••"}
                        </CredentialRow>
                      ) : (
                        <CredentialRow label="Sign-in method">
                          Google sign-in
                        </CredentialRow>
                      )}
                    </div>
                    <div className="mt-6 space-y-2">
                      <p className="vault-field-label">Websites</p>
                      {websites.map((site) => (
                        <button
                          key={site.url}
                          className="block max-w-full cursor-pointer text-left text-sm break-all text-[var(--vault-label)] hover:underline"
                          onClick={() =>
                            void browser.tabs.create({ url: site.url })
                          }
                        >
                          {site.url}
                        </button>
                      ))}
                    </div>
                    {groupsFor(account, folder, data?.collections).map((g) => (
                      <span
                        className="text-xs text-muted-foreground"
                        key={g.id}
                      >
                        {g.name}{" "}
                      </span>
                    ))}
                    {account.tags?.length ? (
                      <p className="text-sm text-muted-foreground">
                        {account.tags.map((tag) => "#" + tag).join(" · ")}
                      </p>
                    ) : null}
                    {account.notes && (
                      <div className="mt-6">
                        <p className="vault-field-label">Notes</p>
                        <p className="text-sm break-words whitespace-pre-wrap">
                          {account.notes}
                        </p>
                      </div>
                    )}
                    <LoginActivity
                      key={account.id}
                      id={account.id}
                      stamp={account.updated_at}
                      created={account.created_at}
                      request={orgRequest}
                    />
                  </div>
                </ScrollArea>
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
            className={`size-1.5 rounded-full ${error ? "bg-destructive" : "bg-primary"}`}
          />
          {busy ? "Syncing…" : error ? "Sync unavailable" : "Synced"}
        </span>
        <span>Global Login</span>
      </footer>
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
      >
        <DialogContent className="vault-editor-dialog max-h-[510px] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? "Edit project" : "Create project"}
            </DialogTitle>
            <DialogDescription>Organize your logins.</DialogDescription>
          </DialogHeader>
          {editor && (
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
