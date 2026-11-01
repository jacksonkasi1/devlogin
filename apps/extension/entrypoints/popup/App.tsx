import { useEffect, useMemo, useRef, useState } from "react"
import { browser } from "wxt/browser"
import {
  accountWebsites,
  type Account,
  type Note,
  type Project,
} from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { Label } from "@workspace/ui/components/label"
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
import { BrandMark } from "@workspace/ui/components/brand-mark"
import {
  ProjectEditor,
  AccountEditor,
  NoteEditor,
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
  StickyNote,
  LogIn,
} from "@workspace/ui/components/devlogin-icons"
import { PopupSettings } from "../../src/popup-settings"
import { LocalProject } from "../../src/local-project"
import { send } from "../../src/client"
import type { Snapshot } from "../../src/messages"
import {
  autofill,
  copyText,
  modKey,
  readNote,
  readPassword,
  searchVault,
  vaultItems,
  type Category,
  type VaultItem,
} from "../../src/vault"

const categories: { value: Category; label: string }[] = [
  { value: "all", label: "All items" },
  { value: "logins", label: "Logins" },
  { value: "notes", label: "Secure notes" },
]
type Editor =
  | { kind: "account"; account?: Account }
  | { kind: "project"; project?: Project }
  | { kind: "note"; note?: Note }
  | null

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [projectId, setProjectId] = useState("all")
  const [category, setCategory] = useState<Category>("all")
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [view, setView] = useState<"vault" | "settings" | "projects">("vault")
  const [editor, setEditor] = useState<Editor>(null)
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
  const searchInput = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
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
  const admin = !!user?.approved && user.is_admin
  const projects = data?.projects ?? []
  const project = projects.find((item) => item.id === projectId)
  const all = useMemo(
    () => vaultItems(data, snapshot?.tabUrl),
    [data, snapshot?.tabUrl]
  )
  const items = useMemo(
    () => searchVault(all, search, { category, projectId }),
    [all, search, category, projectId]
  )
  const item: VaultItem | undefined =
    items.find((entry) => entry.id === selected) ?? items[0]
  const visibleItem = useRef(item?.id)
  visibleItem.current = item?.id
  const secret = revealed?.id === item?.id ? (revealed?.value ?? null) : null
  const itemVersion =
    item?.kind === "login" ? item.account.updated_at : item?.note.updated_at
  useEffect(() => {
    setRevealed(null)
  }, [item?.id, itemVersion])
  useEffect(() => {
    if (secret === null) return
    const timer = setTimeout(() => setRevealed(null), 30000)
    return () => clearTimeout(timer)
  }, [secret])
  useEffect(() => {
    listRef.current
      ?.querySelector(".login-row.selected")
      ?.scrollIntoView({ block: "nearest" })
  }, [item?.id])
  const host = (() => {
    try {
      return /^https?:/.test(snapshot?.tabUrl ?? "")
        ? new URL(snapshot!.tabUrl).host
        : ""
    } catch {
      return ""
    }
  })()
  const copy = async (value: string, title: string) => {
    try {
      await copyText(value)
      toast.success(`${title} copied`)
    } catch {
      toast.error("Clipboard unavailable")
    }
  }
  const reveal = async (target: VaultItem, copyValue = false) => {
    try {
      const value =
        target.kind === "login"
          ? await readPassword(target.id)
          : await readNote(target.id)
      if (copyValue)
        await copy(value, target.kind === "login" ? "Password" : "Note")
      else if (visibleItem.current === target.id)
        setRevealed({ id: target.id, value })
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Could not decrypt item"
      )
    }
  }
  const primary = (target: VaultItem | undefined) => {
    if (!target || busy) return
    if (target.kind === "note") return void reveal(target, true)
    void act(async () => {
      toast.success(
        await autofill(target, {
          tabUrl: snapshot?.tabUrl ?? "",
          tabId: snapshot?.tabId,
          submit: snapshot?.settings.submitAfterFill ?? false,
        })
      )
    })
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
  const create = (kind: "account" | "note" | "project") =>
    setEditor(
      kind === "account" && !projects.length ? { kind: "project" } : { kind }
    )
  const loadNote = useMemo(() => {
    const id = editor?.kind === "note" ? editor.note?.id : undefined
    return id ? () => readNote(id) : undefined
  }, [editor])
  function keydown(event: React.KeyboardEvent) {
    if (event.target !== searchInput.current || view !== "vault") return
    const mod = event.metaKey || event.ctrlKey
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!items.length) return
      const index = Math.max(0, items.indexOf(item!))
      const next =
        (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
        items.length
      setSelected(items[next]!.id)
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault()
      primary(item)
    } else if (mod && event.key.toLowerCase() === "c" && item) {
      const input = searchInput.current!
      if (input.selectionStart !== input.selectionEnd) return
      event.preventDefault()
      if (event.shiftKey) {
        if (item.kind === "login") void copy(item.account.email, "Username")
      } else if (item.kind === "note" || item.account.login_type === "password")
        void reveal(item, true)
    }
  }
  const filterLabel =
    project?.name ??
    categories.find((entry) => entry.value === category)?.label ??
    "All items"
  const counts = {
    all: all.length,
    logins: all.filter((entry) => entry.kind === "login").length,
    notes: all.filter((entry) => entry.kind === "note").length,
  }
  const sites =
    item?.kind === "login" ? accountWebsites(item.account, item.project) : []
  const preference =
    item?.project &&
    data?.preferences.find((p) => p.project_id === item.project!.id)
  let heading = ""
  return (
    <main className="popup-shell" onKeyDown={keydown}>
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
            {project ? (
              <ItemIcon icon={project.icon} folder small />
            ) : (
              <KeyRound className="size-4 text-primary" />
            )}
            <span className="truncate">{filterLabel}</span>
            <ChevronDown className="ml-auto size-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            {categories.map((entry) => (
              <DropdownMenuItem
                key={entry.value}
                onClick={() => {
                  setCategory(entry.value)
                  setProjectId("all")
                }}
              >
                {entry.value === "notes" ? <StickyNote /> : <KeyRound />}
                {entry.label}
                <span className="ml-auto text-muted-foreground">
                  {counts[entry.value]}
                </span>
              </DropdownMenuItem>
            ))}
            {projects.length > 0 && <DropdownMenuSeparator />}
            {projects.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                onClick={() => {
                  setProjectId(entry.id)
                  setCategory("all")
                }}
              >
                <ItemIcon icon={entry.icon} folder small />
                <span className="truncate">{entry.name}</span>
                <span className="ml-auto text-muted-foreground">
                  {all.filter((i) => i.project?.id === entry.id).length}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("projects")}>
              Manage Projects
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="search-box">
          <Search className="pointer-events-none size-4 text-muted-foreground" />
          <input
            ref={searchInput}
            autoFocus
            placeholder={`Search ${filterLabel.toLowerCase()}…`}
            aria-label="Search logins"
            value={search}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              setSearch(event.target.value)
              setSelected(null)
              setView("vault")
            }}
          />
        </div>
        {admin && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" disabled={busy} aria-label="New item" />
              }
            >
              <Plus className="size-4" />
              New
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => create("account")}>
                <KeyRound />
                Login
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => create("note")}>
                <StickyNote />
                Secure note
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => create("project")}>
                <Plus />
                Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Settings menu" />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
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
            {host && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void permission()}>
                  Enable Global Login on this site
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void act(() =>
                      send({
                        type: "exclude",
                        origin: new URL(snapshot!.tabUrl).origin,
                        excluded: !snapshot!.excluded?.includes(
                          new URL(snapshot!.tabUrl).origin
                        ),
                      })
                    )
                  }
                >
                  {snapshot!.excluded?.includes(
                    new URL(snapshot!.tabUrl).origin
                  )
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
      {view !== "vault" ? (
        <section className="popup-screen">
          <Button size="sm" variant="ghost" onClick={() => setView("vault")}>
            <ArrowLeft className="size-4" />
            Back to vault
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
              <div className="space-y-2 border-t py-4">
                <Label>Keyboard shortcuts</Label>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>Quick Access</span>
                  <kbd className="shortcut">
                    {snapshot?.shortcut ?? "Not set"}
                  </kbd>
                </div>
                <p className="text-xs text-muted-foreground">
                  Search logins and notes from any page, then press Enter to
                  autofill.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void browser.tabs.create({
                      url: "chrome://extensions/shortcuts",
                    })
                  }
                >
                  Change shortcuts
                </Button>
              </div>
              <LocalProject snapshot={snapshot} busy={busy} act={act} />
              {item?.kind === "login" && item.project && (
                <div className="flex items-center justify-between gap-3 border-t py-3 text-sm">
                  <Label htmlFor="auto-login">
                    Auto-login · {item.project.name}
                  </Label>
                  <Switch
                    id="auto-login"
                    disabled={busy}
                    checked={!!preference?.auto_login}
                    onCheckedChange={(enabled) =>
                      void act(() =>
                        api("/api/preferences", "PUT", {
                          project_id: item.project!.id,
                          account_id: item.id,
                          auto_login: enabled,
                        })
                      )
                    }
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between py-4">
                <h2 className="font-semibold">Projects</h2>
                {admin && (
                  <Button size="sm" onClick={() => create("project")}>
                    <Plus />
                    Create Project
                  </Button>
                )}
              </div>
              <div className="divide-y">
                {projects.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 py-3">
                    <ItemIcon icon={entry.icon} folder />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{entry.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.description}
                      </p>
                    </div>
                    {admin && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditor({ kind: "project", project: entry })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDeleting({
                              title: `Delete ${entry.name} and all its items?`,
                              path: `/api/projects/${entry.id}`,
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
          <BrandMark globe className="size-12" />
          <h1 className="text-lg font-semibold">
            {!user
              ? "Welcome to Global Login"
              : !user.approved
                ? "Waiting for approval"
                : "Connect to your vault"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {!user
              ? "Peacock Projects"
              : !user.approved
                ? `${user.email} requires administrator approval.`
                : "Refresh to sync your logins and notes."}
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
          <aside className="login-sidebar" aria-label="Vault items">
            <div ref={listRef} className="login-scroll p-2">
              {items.map((entry) => {
                const group = search
                  ? "Results"
                  : entry.suggested
                    ? `Suggested for ${host}`
                    : entry.kind === "login"
                      ? "Logins"
                      : "Secure notes"
                const showHeading = group !== heading
                heading = group
                return (
                  <div key={entry.id}>
                    {showHeading && (
                      <p className="list-heading">
                        <span className="truncate">{group}</span>
                        {group === "Results" && (
                          <span className="ml-auto">{items.length}</span>
                        )}
                      </p>
                    )}
                    <button
                      aria-pressed={item?.id === entry.id}
                      className={`login-row ${item?.id === entry.id ? "selected" : ""}`}
                      onClick={() => setSelected(entry.id)}
                      onDoubleClick={() => primary(entry)}
                    >
                      <ItemIcon
                        icon={
                          entry.kind === "login"
                            ? entry.account.icon
                            : entry.note.icon || undefined
                        }
                        website={
                          entry.kind === "login" ? entry.website : undefined
                        }
                        note={entry.kind === "note"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {entry.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {entry.subtitle}
                        </span>
                      </span>
                    </button>
                  </div>
                )
              })}
              {!items.length && (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {search
                    ? `Nothing matches “${search}”.`
                    : category === "notes"
                      ? "No secure notes yet."
                      : "No saved logins yet."}
                </div>
              )}
            </div>
          </aside>
          <section className="login-details">
            {item ? (
              <div className="detail-scroll">
                <div className="detail-head">
                  <ItemIcon
                    icon={
                      item.kind === "login"
                        ? item.account.icon
                        : item.note.icon || undefined
                    }
                    website={sites[0]?.url}
                    note={item.kind === "note"}
                    large
                  />
                  <div className="min-w-0 flex-1">
                    <h1 className="text-lg leading-tight font-semibold break-words">
                      {item.title}
                    </h1>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      {item.project ? (
                        <>
                          <ItemIcon icon={item.project.icon} folder small />
                          {item.project.name}
                        </>
                      ) : (
                        "Secure note"
                      )}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={
                            item.kind === "login"
                              ? "Login actions"
                              : "Note actions"
                          }
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {item.kind === "login" ? (
                        <>
                          <DropdownMenuItem
                            onClick={() =>
                              void copy(item.account.email, "Username")
                            }
                          >
                            Copy username
                          </DropdownMenuItem>
                          {item.account.login_type === "password" && (
                            <DropdownMenuItem
                              onClick={() => void reveal(item, true)}
                            >
                              Copy password
                            </DropdownMenuItem>
                          )}
                        </>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => void reveal(item, true)}
                        >
                          Copy note
                        </DropdownMenuItem>
                      )}
                      {admin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              setEditor(
                                item.kind === "login"
                                  ? { kind: "account", account: item.account }
                                  : { kind: "note", note: item.note }
                              )
                            }
                          >
                            {item.kind === "login" ? "Edit login" : "Edit note"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              setDeleting({
                                title: `Delete ${item.title}?`,
                                path:
                                  item.kind === "login"
                                    ? `/api/accounts/${item.id}`
                                    : `/api/notes/${item.id}`,
                              })
                            }
                          >
                            {item.kind === "login"
                              ? "Delete login"
                              : "Delete note"}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Button
                  className="mt-4 w-full"
                  disabled={busy || (item.kind === "login" && !sites.length)}
                  onClick={() => primary(item)}
                >
                  {item.kind === "note" ? (
                    <>
                      <Copy className="size-4" />
                      Copy note
                    </>
                  ) : (
                    <>
                      <LogIn className="size-4" />
                      {item.suggested ? "Autofill" : "Open & Fill"}
                    </>
                  )}
                </Button>
                {item.kind === "login" ? (
                  <>
                    <div className="field-card">
                      <div className="credential-field">
                        <div className="min-w-0 flex-1">
                          <p className="field-label">Username</p>
                          <p className="text-sm break-all">
                            {item.account.email}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Copy username"
                          onClick={() =>
                            void copy(item.account.email, "Username")
                          }
                        >
                          <Copy className="size-4" />
                        </Button>
                      </div>
                      <div className="credential-field">
                        <div className="min-w-0 flex-1">
                          <p className="field-label">Password</p>
                          <p className="font-mono text-sm break-all">
                            {item.account.login_type === "google"
                              ? "Google sign-in"
                              : (secret ?? "••••••••••••")}
                          </p>
                        </div>
                        {item.account.login_type === "password" && (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={
                                secret === null
                                  ? "Show password"
                                  : "Hide password"
                              }
                              onClick={() =>
                                secret === null
                                  ? void reveal(item)
                                  : setRevealed(null)
                              }
                            >
                              {secret === null ? (
                                <Eye className="size-4" />
                              ) : (
                                <EyeOff className="size-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Copy password"
                              onClick={() => void reveal(item, true)}
                            >
                              <Copy className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {sites.length > 0 && (
                      <div className="field-card">
                        {sites.map((site) => (
                          <div key={site.url} className="credential-field">
                            <div className="min-w-0 flex-1">
                              <p className="field-label">Website</p>
                              <button
                                className="block max-w-full cursor-pointer text-left text-sm break-all text-primary hover:underline"
                                onClick={() =>
                                  void browser.tabs.create({ url: site.url })
                                }
                              >
                                {site.url}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {item.account.notes && (
                      <div className="field-card">
                        <div className="credential-field">
                          <div className="min-w-0 flex-1">
                            <p className="field-label">Notes</p>
                            <p className="text-sm break-words whitespace-pre-wrap">
                              {item.account.notes}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="field-card">
                    <div className="credential-field items-start">
                      <div className="min-w-0 flex-1">
                        <p className="field-label">Secure note</p>
                        <p className="font-mono text-xs break-words whitespace-pre-wrap">
                          {secret ?? "••••••••••••"}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={secret === null ? "Show note" : "Hide note"}
                        onClick={() =>
                          secret === null
                            ? void reveal(item)
                            : setRevealed(null)
                        }
                      >
                        {secret === null ? (
                          <Eye className="size-4" />
                        ) : (
                          <EyeOff className="size-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
                <p className="mt-6 text-xs text-muted-foreground">
                  Last updated{" "}
                  {new Date(
                    item.kind === "login"
                      ? item.account.updated_at
                      : item.note.updated_at
                  ).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <KeyRound className="size-8 text-muted-foreground" />
                <h2 className="font-medium">
                  {search ? "No matching items" : "Your vault, in one place"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {search
                    ? "Try another title, username, or website."
                    : admin
                      ? "Use New to add a login or secure note."
                      : "Your administrator can add logins."}
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
        <span className="flex items-center gap-3">
          {view === "vault" && data && (
            <span className="hidden sm:inline">
              <kbd className="shortcut">↵</kbd> Fill ·{" "}
              <kbd className="shortcut">{modKey} C</kbd> Copy
            </span>
          )}
          {snapshot?.shortcut && (
            <button
              className="hover:text-foreground"
              title="Quick Access from any page"
              onClick={() =>
                void browser.tabs.create({
                  url: "chrome://extensions/shortcuts",
                })
              }
            >
              Quick Access <kbd className="shortcut">{snapshot.shortcut}</kbd>
            </button>
          )}
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
              {editor?.kind === "project"
                ? editor.project
                  ? "Edit project"
                  : "Create project"
                : editor?.kind === "note"
                  ? editor.note
                    ? "Edit secure note"
                    : "New secure note"
                  : editor?.account
                    ? "Edit login"
                    : "Add login"}
            </DialogTitle>
            <DialogDescription>
              {editor?.kind === "project"
                ? "Organize your logins."
                : editor?.kind === "note"
                  ? "Store keys, codes and other secrets."
                  : "Save a login to your project."}
            </DialogDescription>
          </DialogHeader>
          {editor?.kind === "project" && (
            <ProjectEditor
              key={editor.project?.id ?? "new"}
              project={editor.project}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={(body) =>
                void act(async () => {
                  const saved = await api<Project>(
                    editor.project
                      ? `/api/projects/${editor.project.id}`
                      : "/api/projects",
                    editor.project ? "PUT" : "POST",
                    body
                  )
                  setProjectId(saved.id)
                  setCategory("all")
                  setEditor(null)
                }, "Project saved")
              }
            />
          )}
          {editor?.kind === "note" && (
            <NoteEditor
              key={editor.note?.id ?? "new"}
              note={editor.note}
              projectId={project?.id ?? null}
              projects={projects}
              loadContent={loadNote}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={(body) =>
                void act(async () => {
                  const saved = await api<Note>(
                    editor.note ? `/api/notes/${editor.note.id}` : "/api/notes",
                    editor.note ? "PUT" : "POST",
                    body
                  )
                  setSearch("")
                  setSelected(saved.id)
                  setEditor(null)
                }, "Note saved")
              }
            />
          )}
          {editor?.kind === "account" && (
            <AccountEditor
              key={editor.account?.id ?? "new"}
              account={editor.account}
              projectId={
                editor.account?.project_id ??
                project?.id ??
                snapshot?.matchedProjectId ??
                projects[0]?.id ??
                ""
              }
              projects={projects}
              website={!editor.account && host ? snapshot?.tabUrl : undefined}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={(body) =>
                void act(async () => {
                  const saved = await api<Account>(
                    editor.account
                      ? `/api/accounts/${editor.account.id}`
                      : "/api/accounts",
                    editor.account ? "PUT" : "POST",
                    body
                  )
                  if (projectId !== "all") setProjectId(saved.project_id)
                  setSearch("")
                  setSelected(saved.id)
                  setEditor(null)
                }, "Login saved")
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
                  if (deleting.path.startsWith("/api/projects"))
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
