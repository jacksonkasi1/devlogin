import { useEffect, useState } from "react"
import { browser } from "wxt/browser"
import {
  loginUrl,
  siteProjects,
  accountMatches,
  type Account,
  type Project,
  type Preference,
} from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Toaster, toast } from "@workspace/ui/components/sonner"
import { LocalProject } from "../../src/local-project"
import { CurrentWebsite } from "../../src/current-website"
import { PopupSettings } from "../../src/popup-settings"
import { AccountList } from "../../src/account-list"
import {
  KeyRound,
  RefreshCw,
  Settings,
} from "@workspace/ui/components/devlogin-icons"
import {
  ProjectEditor,
  AccountEditor,
} from "@workspace/ui/components/credential-editors"
import { send } from "../../src/client"
import type { Snapshot, View } from "../../src/messages"

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [view, setView] = useState<View>("home")
  const [projectId, setProjectId] = useState<string | null>(null)
  const [editingProject, setEditingProject] = useState<Project | undefined>()
  const [editingAccount, setEditingAccount] = useState<Account | undefined>()
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [origin, setOrigin] = useState(
    import.meta.env.VITE_API_ORIGIN ?? "https://devlogin.peacockindia.in"
  )
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") ?? "system"
  )
  const [deleting, setDeleting] = useState<{
    title: string
    path: string
  } | null>(null)
  async function refresh() {
    setBusy(true)
    setError("")
    try {
      const next = await send<Snapshot>({ type: "snapshot" })
      setSnapshot(next)
      setTheme(next.settings.theme)
      setOrigin(next.origin)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sync")
      setSnapshot((current) => (current ? { ...current, data: null } : null))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void refresh()
  }, [view])
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
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
  async function act(action: () => Promise<unknown>, success?: string) {
    setBusy(true)
    setError("")
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
  const api = <T,>(path: string, method = "GET", body?: unknown) =>
    send<T>({ type: "api", path, method, body })
  const sourceData = snapshot?.data
  const data = sourceData
    ? { ...sourceData, projects: siteProjects(sourceData, snapshot?.tabUrl) }
    : undefined
  const user = snapshot?.user
  const detected = data
    ? data.projects.find((item) => item.id === snapshot?.matchedProjectId)
    : undefined
  const project = data?.projects.find((item) => item.id === projectId)
  const preference = (item: Project): Preference =>
    data?.preferences.find((pref) => pref.project_id === item.id) ?? {
      project_id: item.id,
      account_id:
        data?.accounts.find(
          (account) => account.project_id === item.id && account.is_default
        )?.id ?? null,
      auto_login: false,
    }
  const savePreference = (item: Project, update: Partial<Preference>) =>
    api("/api/preferences", "PUT", { ...preference(item), ...update })
  const openProject = (item: Project) => {
    setProjectId(item.id)
    setView("accounts")
  }
  async function login(account: Account, submit: boolean) {
    await act(async () => {
      const item = data?.projects.find(
        (project) => project.id === account.project_id
      )
      if (item) await savePreference(item, { account_id: account.id })
      const result = await send<{ message: string }>({
        type: "manual",
        accountId: account.id,
        submit,
      })
      toast.success(result.message)
    })
  }
  const accountList = (item: Project) => (
    <AccountList
      accounts={
        data?.accounts.filter(
          (account) =>
            account.project_id === item.id &&
            (view !== "home" ||
              accountMatches(account, snapshot?.tabUrl ?? item.urls[0]!))
        ) ?? []
      }
      admin={!!user?.is_admin}
      busy={busy}
      onLogin={(account, submit) => void login(account, submit)}
      onEdit={(account) => {
        setProjectId(item.id)
        setEditingAccount(account)
        setView("account-edit")
      }}
      onDelete={(account) =>
        setDeleting({
          title: `Delete ${account.label}?`,
          path: `/api/accounts/${account.id}`,
        })
      }
      onAdd={() => {
        setProjectId(item.id)
        setEditingAccount(undefined)
        setView("account-edit")
      }}
    />
  )
  async function permission(wide = false) {
    try {
      const address = wide
        ? ["https://*/*", "http://*/*"]
        : [new URL(snapshot?.tabUrl ?? "").origin + "/*"]
      const allowed = await browser.permissions.request({ origins: address })
      if (!allowed) {
        toast.error("Site permission was not granted")
        return
      }
      await send({ type: "permissions-changed" })
      await refresh()
      toast.success("DevLogin enabled")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to enable this site"
      )
    }
  }
  const currentOrigin = snapshot?.tabUrl?.startsWith("http")
    ? new URL(snapshot.tabUrl).origin
    : ""
  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4" />
            DevLogin
          </h1>
          <p className="text-xs text-muted-foreground">
            {user?.approved
              ? "Connected · Internal workspace"
              : "Sign in to sync"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            disabled={busy}
            size="sm"
            variant="ghost"
            aria-label="Refresh"
            onClick={() => void refresh()}
          >
            <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Settings"
            onClick={() => setView("settings")}
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </header>
      <nav className="flex gap-1">
        {(["home", "projects"] as const).map((item) => (
          <Button
            key={item}
            size="sm"
            variant={view === item ? "secondary" : "ghost"}
            onClick={() => setView(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </Button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {view === "settings" ? (
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
      ) : !user ? (
        <Card>
          <CardHeader>
            <CardTitle>Welcome to DevLogin</CardTitle>
            <CardDescription>
              Sign in with Google to access your internal logins.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              disabled={busy}
              onClick={() => void act(() => send({ type: "login" }))}
            >
              Continue with Google
            </Button>
            <p className="text-xs text-muted-foreground">
              Set the backend origin in Settings first. Reopen the popup after
              Google sign-in.
            </p>
          </CardContent>
        </Card>
      ) : !user.approved ? (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for Approval</CardTitle>
            <CardDescription>
              {user.email} requires administrator approval.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button disabled={busy} onClick={() => void refresh()}>
              Check approval
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void act(() => send({ type: "logout" }))}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      ) : !data ? (
        <Button onClick={() => void refresh()}>Retry sync</Button>
      ) : (
        <>
          {view === "home" && (
            <>
              <LocalProject snapshot={snapshot} busy={busy} act={act} />
              <CurrentWebsite
                detected={detected}
                data={data}
                user={user}
                snapshot={snapshot}
                busy={busy}
                preference={preference}
                act={act}
                savePreference={savePreference}
                openProject={openProject}
                permission={permission}
                accountList={accountList}
                currentOrigin={currentOrigin}
                setEditingProject={setEditingProject}
                setView={setView}
              />
            </>
          )}
          {view === "projects" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  aria-label="Search projects"
                  placeholder="Search projects"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {user.is_admin && (
                  <Button
                    onClick={() => {
                      setEditingProject(undefined)
                      setView("project-edit")
                    }}
                  >
                    Add
                  </Button>
                )}
              </div>
              {data.projects
                .filter((item) =>
                  `${item.name} ${item.urls.join(" ")}`
                    .toLowerCase()
                    .includes(search.toLowerCase())
                )
                .map((item) => (
                  <Card key={item.id}>
                    <CardContent className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.urls[0]}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => openProject(item)}
                      >
                        Accounts
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              {data.projects.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No projects yet.
                </p>
              )}
            </div>
          )}
          {view === "accounts" &&
            (project ? (
              <div className="space-y-3">
                <Button variant="ghost" onClick={() => setView("projects")}>
                  ← Projects
                </Button>
                <h2 className="font-medium">{project.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {project.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {project.urls.map((url) => (
                    <Button
                      key={url}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void browser.tabs.create({
                          url: loginUrl(project, url),
                        })
                      }
                    >
                      Open {new URL(url).host}
                    </Button>
                  ))}
                </div>
                {user.is_admin && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setEditingAccount(undefined)
                        setView("account-edit")
                      }}
                    >
                      Add account
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingProject(project)
                        setView("project-edit")
                      }}
                    >
                      Edit project
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDeleting({
                          title: `Delete ${project.name} and all its accounts?`,
                          path: `/api/projects/${project.id}`,
                        })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                )}
                {accountList(project)}
              </div>
            ) : (
              <p>Project was removed. Return to Projects.</p>
            ))}
          {view === "project-edit" && user.is_admin && (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setView("home")
              }}
            >
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Manage project</DialogTitle>
                  <DialogDescription>
                    Organize your shared logins.
                  </DialogDescription>
                </DialogHeader>
                <ProjectEditor
                  key={editingProject?.id ?? "new"}
                  project={editingProject}
                  website={
                    view === "project-edit" && currentOrigin
                      ? snapshot?.tabUrl
                      : undefined
                  }
                  busy={busy}
                  onCancel={() => setView("projects")}
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
                      setView("accounts")
                    }, "Project saved")
                  }
                />
              </DialogContent>
            </Dialog>
          )}
          {view === "account-edit" && user.is_admin && project && (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setView("accounts")
              }}
            >
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Manage login</DialogTitle>
                  <DialogDescription>
                    Changes sync to the shared workspace.
                  </DialogDescription>
                </DialogHeader>
                <AccountEditor
                  key={editingAccount?.id ?? "new"}
                  account={editingAccount}
                  projectId={project.id}
                  environments={project.urls}
                  projects={data?.projects ?? []}
                  website={
                    !editingAccount
                      ? snapshot?.tabUrl?.startsWith("http")
                        ? snapshot.tabUrl
                        : undefined
                      : undefined
                  }
                  busy={busy}
                  onCancel={() => setView("accounts")}
                  onSave={(body) =>
                    void act(async () => {
                      await api(
                        editingAccount
                          ? `/api/accounts/${editingAccount.id}`
                          : "/api/accounts",
                        editingAccount ? "PUT" : "POST",
                        body
                      )
                      setView("accounts")
                    }, "Account saved")
                  }
                />
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
      <footer className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <span>
          {busy ? "Syncing…" : error ? "Sync unavailable" : "✓ Synced"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void browser.tabs.create({ url: origin })}
        >
          Open Web Dashboard ↗
        </Button>
      </footer>
      {currentOrigin && user?.approved && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void act(
              () =>
                send({
                  type: "exclude",
                  origin: currentOrigin,
                  excluded: !snapshot?.excluded?.includes(currentOrigin),
                }),
              "Site preference saved"
            )
          }
        >
          {snapshot?.excluded?.includes(currentOrigin)
            ? "Include this website"
            : "Exclude this website"}
        </Button>
      )}
      <Dialog
        open={Boolean(deleting)}
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
          <div className="flex gap-2">
            <Button
              disabled={busy}
              variant="destructive"
              onClick={() => {
                if (deleting)
                  void act(async () => {
                    await api(deleting.path, "DELETE", {})
                    setDeleting(null)
                    setView("projects")
                  }, "Deleted")
              }}
            >
              Delete
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Toaster theme={theme as "light" | "dark" | "system"} />
    </main>
  )
}
