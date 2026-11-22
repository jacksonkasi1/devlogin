import { Files } from "./components/files"
import type { PersonalKind } from "@workspace/shared"
import { VaultTools } from "@workspace/ui/components/private-vault"
import { ItemMenu } from "@workspace/ui/components/item-menu"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ApiError,
  apiRequest,
  type User,
  type Sync,
  type Project,
  type Account,
} from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsContent } from "@workspace/ui/components/tabs"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@workspace/ui/components/table"
import { Toaster, toast } from "@workspace/ui/components/sonner"
import {
  ManagementDialogs,
  ProjectsView,
  type Editor,
} from "./components/workspace-management"
import { KeyRound, Settings, Users, LogOut, RefreshCw, Bot } from "lucide-react"
import { VaultMark, VaultSearch } from "@workspace/ui/components/vault"
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@workspace/ui/components/avatar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { useTheme } from "./components/theme-provider"
import { ThemeToggle } from "./components/theme-toggle"
import { McpPage } from "./components/mcp-page"
import { BackupPanel } from "./components/backup-panel"
import { Switch } from "@workspace/ui/components/switch"

import { refreshWebsiteIcons, type RefreshPage } from "@workspace/shared"

const personalRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  apiRequest<T>("", path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
const api = <T,>(path: string, options?: RequestInit) =>
  apiRequest<T>("", path, options)
export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [data, setData] = useState<Sync | null>(null)
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [editor, setEditor] = useState<Editor>(null)
  const [selected, setSelected] = useState<Project | null>(null)
  const [tool, setTool] = useState<PersonalKind | "generator">()
  const [toolKey, setToolKey] = useState(0)
  const [tab, setTab] = useState(
    location.hash === "#files" ? "files" : "projects"
  )
  const [search, setSearch] = useState("")
  const [accountId, setAccountId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const moveInFlight = useRef(false)
  const [mobilePanel, setMobilePanel] = useState<
    "projects" | "accounts" | "details"
  >("projects")
  const { theme, setTheme } = useTheme()
  const canEdit = !!user && (user.is_admin || user.can_edit)
  const refresh = useCallback(async () => {
    try {
      const me = await api<User>("/api/me")
      setError("")
      setUser(me)
      if (me.approved) {
        const sync = await api<Sync>("/api/sync")
        setData(sync)
        setAccountId((current) =>
          sync.accounts.some((account) => account.id === current)
            ? current
            : null
        )
        setSelected(
          (current) =>
            sync.projects.find((project) => project.id === current?.id) ?? null
        )
        if (me.is_admin) setRegisteredUsers(await api<User[]>("/api/users"))
      } else {
        setData(null)
        setAccountId(null)
        setSelected(null)
        setRegisteredUsers([])
      }
    } catch (failure) {
      setData(null)
      setAccountId(null)
      setSelected(null)
      setRegisteredUsers([])
      if (failure instanceof ApiError && failure.status === 401) setUser(null)
      else
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load Global Login"
        )
    } finally {
      setLoading(false)
    }
  }, [])
  const reload = useCallback(() => {
    setLoading(true)
    setError("")
    void refresh()
  }, [refresh])
  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [refresh])
  useEffect(() => {
    const focus = () => {
      reload()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 30_000)
    window.addEventListener("focus", focus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", focus)
    }
  }, [reload, refresh])
  async function refetchIcons(id?: string) {
    try {
      const message = await refreshWebsiteIcons(
        (body) =>
          api<RefreshPage>("/api/favicons/refresh", {
            method: "POST",
            body: JSON.stringify(body),
          }),
        id
      )
      await refresh()
      toast.success(message)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Icon refresh failed"
      )
    }
  }
  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" })
      setUser(null)
      setData(null)
      setAccountId(null)
      setSelected(null)
      setRegisteredUsers([])
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Sign out failed"
      )
    }
  }
  async function moveLogin(account: Account, project: Project) {
    if (!canEdit || moveInFlight.current || account.project_id === project.id)
      return
    moveInFlight.current = true
    setMoving(true)
    try {
      await api<Account>(`/api/accounts/${account.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...account, project_id: project.id }),
      })
      await refresh()
      setSelected(project)
      setAccountId(account.id)
      setSearch("")
      toast.success(`Moved to ${project.name}`)
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not move login"
      )
    } finally {
      moveInFlight.current = false
      setMoving(false)
    }
  }
  async function signIn() {
    setLoading(true)
    setError("")
    try {
      const status = await api<{ configured: boolean }>("/api/auth/status")
      if (!status.configured)
        throw new Error(
          "Google OAuth is not configured yet. Add the client credentials to the Worker."
        )
      window.location.assign("/api/auth/google")
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not start Google sign-in"
      )
      setLoading(false)
    }
  }
  async function updateUser(
    id: string,
    changes: Partial<
      Pick<User, "approved" | "is_admin" | "can_edit" | "can_backup">
    >
  ) {
    setLoading(true)
    try {
      await api(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      })
      toast.success("Access updated")
      await refresh()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Update failed")
      setLoading(false)
    }
  }
  const notice = error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )
  const toaster = <Toaster theme={theme} />
  if (!user)
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <VaultMark />
            <CardTitle className="mt-3 text-2xl font-semibold">
              Global Login
            </CardTitle>
            <CardDescription>
              Your internal project logins, in one place.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {notice}
            {new URLSearchParams(window.location.search).has("auth_error") && (
              <p role="alert" className="text-sm text-destructive">
                Google sign-in failed or was cancelled. Please try again.
              </p>
            )}
            <Button
              className="w-full"
              disabled={loading}
              onClick={() => void signIn()}
            >
              {loading ? "Loading…" : "Continue with Google"}
            </Button>
            {error && (
              <Button variant="outline" onClick={reload}>
                Retry
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              New accounts require administrator approval.
            </p>
          </CardContent>
        </Card>
        {toaster}
      </main>
    )
  if (!user.approved)
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Waiting for Approval</CardTitle>
            <CardDescription>
              Signed in as {user.email}. An administrator must approve your
              account before you can access the shared workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {notice}
            <div className="flex gap-2">
              <Button disabled={loading} onClick={reload}>
                {loading ? "Checking…" : "Check approval"}
              </Button>
              <Button variant="outline" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
        {toaster}
      </main>
    )
  return (
    <TooltipProvider delay={300}>
      <main className="flex h-dvh flex-col overflow-hidden">
        <header className="vault-header flex flex-wrap items-center gap-3 px-4 py-2 md:gap-5">
          <button
            className="flex items-center gap-2 font-semibold md:w-[170px] lg:w-[212px]"
            onClick={() => setTab("projects")}
            aria-label="Global Login logins"
          >
            <VaultMark />
            Global Login
          </button>
          <div className="order-last w-full md:order-none md:max-w-xl md:flex-1">
            <VaultSearch
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setMobilePanel("accounts")
                setTab("projects")
              }}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <ItemMenu
              onLogin={
                canEdit
                  ? () =>
                      setEditor(
                        data?.projects.length
                          ? { kind: "account", project: selected ?? undefined }
                          : { kind: "project" }
                      )
                  : undefined
              }
              onCategory={(kind) => {
                setTool(kind)
                setToolKey((key) => key + 1)
                setTab("tools")
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Profile menu"
                  />
                }
              >
                <Avatar className="size-7">
                  <AvatarImage
                    src={user.avatar_url ?? undefined}
                    referrerPolicy="no-referrer"
                    alt={user.name}
                  />
                  <AvatarFallback>
                    {user.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setTab("projects")}>
                  <KeyRound />
                  Logins
                </DropdownMenuItem>
                {user.is_admin && (
                  <DropdownMenuItem onClick={() => setTab("users")}>
                    <Users />
                    Users
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    setTool("generator")
                    setToolKey((k) => k + 1)
                    setTab("tools")
                  }}
                >
                  Tools · Password generator
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setTool(undefined)
                    setToolKey((k) => k + 1)
                    setTab("tools")
                  }}
                >
                  My private vault
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("files")}>
                  File attachments
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("mcp")}>
                  <Bot />
                  MCP
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTab("settings")}>
                  <Settings />
                  Settings
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onClick={() => void refetchIcons()}>
                    <RefreshCw />
                    Refetch all favicons
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={loading} onClick={reload}>
                  <RefreshCw />
                  {loading ? "Refreshing…" : "Refresh"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => location.assign("/releases.html")}
                >
                  What’s new
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {error && (
          <div className="flex items-center gap-3 border-b px-4 py-2">
            {notice}
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={reload}
            >
              Retry
            </Button>
          </div>
        )}
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          className="min-h-0 flex-1 gap-0"
        >
          <TabsContent
            value="projects"
            className="flex min-h-0 flex-1 flex-col"
          >
            <ProjectsView
              data={data}
              selected={selected}
              setSelected={setSelected}
              admin={canEdit}
              setEditor={setEditor}
              search={search}
              accountId={accountId}
              setAccountId={setAccountId}
              loading={loading}
              mobilePanel={mobilePanel}
              setMobilePanel={setMobilePanel}
              moving={moving}
              refreshGroups={refresh}
              openPersonal={(destination) => {
                if (destination === "files") {
                  setTab("files")
                  return
                }
                setTool(destination === "generator" ? "generator" : undefined)
                setToolKey((k) => k + 1)
                setTab("tools")
              }}
              onRefreshIcon={(id) => void refetchIcons(id)}
              onMove={(account, project) => void moveLogin(account, project)}
            />
          </TabsContent>
          {user.is_admin && (
            <TabsContent
              value="users"
              className="min-h-0 overflow-auto p-4 md:p-8"
            >
              <h2 className="font-medium">
                Users{" "}
                <Badge variant="secondary">
                  {registeredUsers.filter((item) => !item.approved).length}{" "}
                  pending / disabled
                </Badge>
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registeredUsers.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p>{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.email}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={item.approved ? "default" : "secondary"}
                        >
                          {item.approved
                            ? item.is_admin
                              ? "Admin"
                              : "Approved"
                            : "Pending / disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.approved && (
                          <div className="space-y-1 text-xs">
                            {(
                              [
                                ["can_edit", "Can edit"],
                                ["can_backup", "Backup"],
                                ["is_admin", "Admin"],
                              ] as const
                            ).map(([key, label]) => (
                              <label
                                key={key}
                                className="flex items-center gap-2"
                              >
                                <Switch
                                  size="sm"
                                  aria-label={`${label} ${item.email}`}
                                  checked={
                                    item[key] ||
                                    (key !== "is_admin" && item.is_admin)
                                  }
                                  disabled={
                                    loading ||
                                    (key !== "is_admin" && item.is_admin) ||
                                    (key === "is_admin" && item.id === user.id)
                                  }
                                  onCheckedChange={(value) =>
                                    void updateUser(item.id, { [key]: value })
                                  }
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.id !== user.id && (
                          <div className="flex gap-2">
                            {!item.approved && (
                              <Button
                                disabled={loading}
                                onClick={() =>
                                  void updateUser(item.id, { approved: true })
                                }
                              >
                                Approve
                              </Button>
                            )}
                            <Button
                              disabled={loading}
                              variant="outline"
                              onClick={() =>
                                void updateUser(item.id, { approved: false })
                              }
                            >
                              {item.approved ? "Disable" : "Reject"}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          )}
          <TabsContent value="tools" className="min-h-0 overflow-auto">
            <VaultTools
              key={toolKey}
              request={personalRequest}
              initial={tool}
            />
          </TabsContent>
          <TabsContent value="files" className="min-h-0 overflow-auto">
            <Files />
          </TabsContent>
          <TabsContent value="mcp" className="min-h-0 overflow-auto p-4 md:p-8">
            <McpPage user={user} />
          </TabsContent>
          <TabsContent
            value="settings"
            className="min-h-0 overflow-auto p-4 md:p-8"
          >
            <Card>
              <CardHeader>
                <CardTitle>Settings</CardTitle>
                <CardDescription>
                  {user.name} · {user.email}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {user.avatar_url && (
                  <img
                    src={user.avatar_url}
                    referrerPolicy="no-referrer"
                    alt="Google profile"
                    className="size-12 rounded-full"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {(["light", "dark", "system"] as const).map((value) => (
                    <Button
                      key={value}
                      variant={theme === value ? "default" : "outline"}
                      onClick={() => setTheme(value)}
                    >
                      {value[0].toUpperCase() + value.slice(1)}
                    </Button>
                  ))}
                </div>
                <Button variant="outline" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </CardContent>
            </Card>
            <div className="mt-4">
              <BackupPanel user={user} onImported={reload} />
            </div>
          </TabsContent>
        </Tabs>
        {canEdit && (
          <ManagementDialogs
            editor={editor}
            setEditor={setEditor}
            refresh={refresh}
            data={data}
            onAccount={(account) => {
              setMobilePanel("details")
              setAccountId(account.id)
              setSearch("")
              setTab("projects")
              setSelected(
                () =>
                  data?.projects.find(
                    (project) => project.id === account.project_id
                  ) ?? null
              )
            }}
            onProject={(project) => {
              setSelected(project)
              setAccountId(null)
              setMobilePanel("accounts")
              setTab("projects")
            }}
          />
        )}
        {toaster}
      </main>
    </TooltipProvider>
  )
}
