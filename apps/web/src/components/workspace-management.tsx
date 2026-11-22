import { LibraryOverview } from "./library-overview"
import { groupsFor, orderLogins, type SortOrder } from "@workspace/shared"
import {
  OrganizationMenu,
  LoginActivity,
} from "@workspace/ui/components/organization"
import { useState, type ReactNode } from "react"
import {
  apiRequest,
  accountWebsites,
  type Project,
  type Account,
  type Sync,
} from "@workspace/shared"
import {
  Shield,
  Paperclip,
  Dice5,
  ArrowLeft,
  LayoutGrid,
  Layers,
  List,
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@workspace/ui/components/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@workspace/ui/components/alert-dialog"
import {
  ProjectEditor,
  AccountEditor,
} from "@workspace/ui/components/credential-editors"
import { ItemIcon } from "@workspace/ui/components/item-icon"
import {
  CredentialRow,
  LoginActions,
  LoginHeading,
  LoginRow,
  copyCredential,
} from "@workspace/ui/components/vault"
import { Files } from "./files"
import { AccountPassword } from "./account-password"
import { toast } from "@workspace/ui/components/sonner"

const orgRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  apiRequest<T>("", path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
export type Editor =
  | { kind: "project"; project?: Project }
  | { kind: "account"; project?: Project; account?: Account }
  | { kind: "delete"; path: string; title: string }
  | null

export function ManagementDialogs({
  editor,
  setEditor,
  refresh,
  data,
  onProject,
  onAccount,
}: {
  editor: Editor
  setEditor: (value: Editor) => void
  refresh: () => Promise<void>
  data: Sync | null
  onProject: (project: Project) => void
  onAccount: (account: Account) => void
}) {
  const [busy, setBusy] = useState(false)
  const project =
    editor?.kind === "account"
      ? (editor.project ?? data?.projects[0])
      : undefined
  async function save(path: string, method: string, body: unknown) {
    setBusy(true)
    try {
      const result = await apiRequest<Project | Account>("", path, {
        method,
        body: JSON.stringify(body),
      })
      await refresh()
      if (editor?.kind === "project") onProject(result as Project)
      if (editor?.kind === "account") onAccount(result as Account)
      setEditor(null)
      toast.success(method === "DELETE" ? "Deleted" : "Saved and synced")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save")
    } finally {
      setBusy(false)
    }
  }
  if (editor?.kind === "delete")
    return (
      <AlertDialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{editor.title}</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the shared record for every developer. Project
              deletion also removes its accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => void save(editor.path, "DELETE", {})}
            >
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  return (
    <Dialog
      open={!!editor}
      onOpenChange={(open) => {
        if (!open && !busy) setEditor(null)
      }}
    >
      <DialogContent
        className={`vault-editor-dialog max-h-[85dvh] sm:max-w-[500px] ${editor?.kind === "account" ? "vault-login-dialog" : "overflow-y-auto"}`}
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>
            {editor?.kind === "account"
              ? editor.account
                ? "Edit login"
                : "Add login"
              : editor?.project
                ? "Edit project"
                : "Add project"}
          </DialogTitle>
          <DialogDescription>
            {editor?.kind === "account"
              ? "Save a login to your shared workspace."
              : "Organize your logins in a project."}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="vault-editor-fieldset">
          {editor?.kind === "project" && (
            <ProjectEditor
              key={editor.project?.id ?? "new"}
              groups={data?.collections}
              project={editor.project}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={(body) =>
                void save(
                  editor.project
                    ? `/api/projects/${editor.project.id}`
                    : "/api/projects",
                  editor.project ? "PUT" : "POST",
                  body
                )
              }
            />
          )}
          {editor?.kind === "account" && project && (
            <>
              <AccountEditor
                key={editor.account?.id ?? project.id}
                groups={data?.collections}
                attachments={
                  editor.account && (
                    <Files
                      key={editor.account.id}
                      accountId={editor.account.id}
                    />
                  )
                }
                loadPassword={
                  editor.account
                    ? async () =>
                        (
                          await orgRequest<{ password: string }>(
                            `/api/accounts/${editor.account!.id}/password`,
                            "POST",
                            {}
                          )
                        ).password
                    : undefined
                }
                account={editor.account}
                projectId={project.id}
                projects={data?.projects ?? []}
                environments={project.urls}
                busy={busy}
                onCancel={() => setEditor(null)}
                onSave={(body) =>
                  void save(
                    editor.account
                      ? `/api/accounts/${editor.account.id}`
                      : "/api/accounts",
                    editor.account ? "PUT" : "POST",
                    body
                  )
                }
              />
            </>
          )}
        </fieldset>
      </DialogContent>
    </Dialog>
  )
}

export function IconAction({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-md"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
function Field({
  label,
  children,
  actions,
}: {
  label: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <dt className="vault-field-label">{label}</dt>
        <dd className="text-sm break-all">{children}</dd>
      </div>
      <div className="flex shrink-0 gap-1">{actions}</div>
    </div>
  )
}

export function ProjectsView({
  data,
  selected,
  setSelected,
  admin,
  setEditor,
  search,
  accountId,
  setAccountId,
  loading,
  mobilePanel,
  setMobilePanel,
  moving,
  refreshGroups,
  openPersonal,
  onRefreshIcon,
  onMove,
}: {
  data: Sync | null
  selected: Project | null
  setSelected: (project: Project | null) => void
  admin: boolean
  setEditor: (editor: Editor) => void
  search: string
  accountId: string | null
  setAccountId: (id: string | null) => void
  loading: boolean
  mobilePanel: "projects" | "accounts" | "details"
  setMobilePanel: (panel: "projects" | "accounts" | "details") => void
  moving: boolean
  refreshGroups: () => Promise<unknown>
  openPersonal: (destination: "vault" | "generator" | "files") => void
  onRefreshIcon: (id: string) => void
  onMove: (account: Account, project: Project) => void
}) {
  const [view, setView] = useState<"list" | "projects" | "collections">("list")
  const [group, setGroup] = useState("")
  const [sort, setSort] = useState<SortOrder>(
    () => (localStorage.getItem("login-sort") as SortOrder) ?? "priority"
  )
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const projects = data?.projects ?? []
  const dragged = data?.accounts.find((a) => a.id === draggedId)
  const canDrop = (p: Project) =>
    admin && !loading && !moving && !!dragged && dragged.project_id !== p.id
  const query = search.trim().toLowerCase()
  const filtered = (data?.accounts ?? []).filter(
    (a) =>
      (!group ||
        groupsFor(
          a,
          projects.find((p) => p.id === a.project_id),
          data?.collections
        ).some((g) => g.id === group)) &&
      (!selected || a.project_id === selected.id) &&
      `${groupsFor(
        a,
        projects.find((p) => p.id === a.project_id),
        data?.collections
      )
        .map((g) => g.name)
        .join(
          " "
        )} ${a.label} ${a.email} ${(a.tags ?? []).join(" ")} ${(projects.find((p) => p.id === a.project_id)?.tags ?? []).join(" ")} ${accountWebsites(
        a
      )
        .map((s) => s.url)
        .join(
          " "
        )} ${a.environment} ${projects.find((p) => p.id === a.project_id)?.name ?? ""}`
        .toLowerCase()
        .includes(query)
  )
  const accounts = orderLogins(filtered, sort)
  const account = accounts.find((a) => a.id === accountId)
  const project = projects.find((p) => p.id === account?.project_id)
  const panel = mobilePanel
  const chooseProject = (p: Project | null) => {
    setView("list")
    setSelected(p)
    setAccountId(null)
    setMobilePanel("accounts")
  }
  const row =
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
  const collections = data?.collections ?? []
  const overview = (kind: "projects" | "collections") => (
    <LibraryOverview
      kind={kind}
      data={data}
      query={query}
      admin={admin}
      group={group}
      setGroup={setGroup}
      sort={sort}
      setSort={setSort}
      request={orgRequest}
      refreshGroups={refreshGroups}
      createProject={() => setEditor({ kind: "project" })}
      chooseProject={chooseProject}
      openCollection={(id) => {
        setGroup(id)
        setView("projects")
        setAccountId(null)
        setSelected(null)
        setMobilePanel("details")
      }}
    />
  )
  const browsing =
    view !== "list" &&
    !selected &&
    !accountId &&
    !(query && mobilePanel === "accounts")
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside
        aria-label="Projects"
        className={`${panel === "projects" ? "flex" : "hidden"} w-full shrink-0 flex-col border-r bg-sidebar md:flex md:w-[190px] lg:w-[232px]`}
      >
        <div className="vault-pane-bar flex items-center justify-between px-4">
          <h2 className="text-sm font-semibold">Workspace</h2>
          {admin && (
            <IconAction
              label="Add Project"
              onClick={() => setEditor({ kind: "project" })}
            >
              <Plus />
            </IconAction>
          )}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="space-y-1 px-2 pb-4">
            {(["projects", "collections"] as const).map((mode) => (
              <button
                key={mode}
                className={
                  row + (browsing && view === mode ? " bg-accent" : "")
                }
                onClick={() => {
                  setGroup("")
                  setSelected(null)
                  setAccountId(null)
                  setView(mode)
                  setMobilePanel("details")
                }}
              >
                {mode === "projects" ? (
                  <LayoutGrid size={16} />
                ) : (
                  <Layers size={16} />
                )}{" "}
                {mode === "projects" ? "Project grid" : "Collections"}
              </button>
            ))}
            <button
              className={`${row} ${!browsing && !selected ? "bg-accent font-medium" : ""}`}
              aria-current={!browsing && !selected ? "true" : undefined}
              onClick={() => {
                setGroup("")
                chooseProject(null)
              }}
            >
              <KeyRound className="size-4" />
              <span className="flex-1">All Logins</span>
              <span className="text-xs text-muted-foreground">
                {data?.accounts.length ?? 0}
              </span>
            </button>
            <Separator className="my-3" />
            <h3 className="library-nav-heading">Projects</h3>
            {!data && loading
              ? Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="my-2 h-10" />
                ))
              : projects.map((p) => (
                  <button
                    key={p.id}
                    className={`${row} ${selected?.id === p.id ? "bg-accent font-medium" : ""} ${dropId === p.id ? "bg-accent ring-2 ring-primary ring-inset" : ""}`}
                    aria-current={selected?.id === p.id ? "true" : undefined}
                    onClick={() => {
                      setGroup("")
                      chooseProject(p)
                    }}
                    onDragOver={(event) => {
                      if (!canDrop(p)) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = "move"
                      setDropId(p.id)
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null
                        )
                      )
                        setDropId(null)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (
                        canDrop(p) &&
                        dragged &&
                        event.dataTransfer.getData(
                          "application/x-devlogin-account"
                        ) === dragged.id
                      )
                        onMove(dragged, p)
                      setDraggedId(null)
                      setDropId(null)
                    }}
                  >
                    <ItemIcon icon={p.icon} folder />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {
                        data?.accounts.filter((a) => a.project_id === p.id)
                          .length
                      }
                    </span>
                  </button>
                ))}
            {data && !projects.length && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {admin
                  ? "Add your first project to get started."
                  : "Your administrator can add projects."}
              </p>
            )}
          </nav>
        </ScrollArea>
        <nav aria-label="Personal tools" className="border-t p-2">
          <h3 className="library-nav-heading">Personal</h3>
          <button className={row} onClick={() => openPersonal("vault")}>
            <Shield size={16} />
            My private vault
          </button>
          <button className={row} onClick={() => openPersonal("files")}>
            <Paperclip size={16} />
            File attachments
          </button>
          <button className={row} onClick={() => openPersonal("generator")}>
            <Dice5 size={16} />
            Password generator
          </button>
        </nav>
      </aside>
      {browsing ? (
        <div className="min-w-0 flex-1 overflow-auto">
          <Button
            variant="ghost"
            className="md:hidden"
            onClick={() => {
              setView("list")
              setMobilePanel("projects")
            }}
          >
            <ArrowLeft />
            Workspace
          </Button>
          {overview(view === "projects" ? "projects" : "collections")}
        </div>
      ) : (
        <>
          <section
            aria-label="Accounts"
            className={`${panel === "accounts" ? "flex" : "hidden"} w-full shrink-0 flex-col border-r md:flex md:w-[280px] lg:w-[320px]`}
          >
            <div className="vault-pane-bar flex items-center gap-2 px-4">
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                aria-label="Back to projects"
                onClick={() => setMobilePanel("projects")}
              >
                <ArrowLeft />
              </Button>
              <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
                {data?.collections?.find((g) => g.id === group)?.name ??
                  selected?.name ??
                  "All Logins"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {accounts.length}
              </span>
              <OrganizationMenu
                sort={sort}
                onSort={(value) => {
                  setSort(value)
                  localStorage.setItem("login-sort", value)
                }}
                projectId={selected?.id}
                groups={collections.filter(
                  (g) =>
                    !selected || !g.project_id || g.project_id === selected.id
                )}
                group={group}
                change={setGroup}
                request={orgRequest}
                editable={admin}
                refresh={refreshGroups}
              />
              {selected && admin && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Project actions"
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        setEditor({ kind: "project", project: selected })
                      }
                    >
                      <Pencil />
                      Edit project
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() =>
                        setEditor({
                          kind: "delete",
                          path: `/api/projects/${selected.id}`,
                          title: `Delete ${selected.name}?`,
                        })
                      }
                    >
                      <Trash2 />
                      Delete project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-1 p-2">
                {!data && loading
                  ? Array.from({ length: 5 }, (_, i) => (
                      <Skeleton key={i} className="mb-2 h-16" />
                    ))
                  : accounts.map((a) => {
                      const p = projects.find((p) => p.id === a.project_id)
                      return (
                        <LoginRow
                          key={a.id}
                          name={
                            a.label === a.email ? (p?.name ?? "Login") : a.label
                          }
                          username={a.email}
                          icon={a.icon}
                          website={accountWebsites(a, p)[0]?.url}
                          favicon={a.favicon}
                          draggable={admin && !loading && !moving}
                          title={
                            admin
                              ? "Drag onto a project to move this login"
                              : undefined
                          }
                          onDragStart={(event) => {
                            event.dataTransfer.setData(
                              "application/x-devlogin-account",
                              a.id
                            )
                            event.dataTransfer.effectAllowed = "move"
                            setDraggedId(a.id)
                          }}
                          onDragEnd={() => {
                            setDraggedId(null)
                            setDropId(null)
                          }}
                          aria-pressed={account?.id === a.id}
                          className={`${draggedId === a.id ? "opacity-50" : ""} ${admin && !moving ? "cursor-grab active:cursor-grabbing" : ""}`}
                          onClick={() => {
                            setAccountId(a.id)
                            setMobilePanel("details")
                          }}
                        />
                      )
                    })}
                {data && !accounts.length && (
                  <div className="px-3 py-8 text-sm text-muted-foreground">
                    <p>{query ? "No matching logins" : "No logins yet"}</p>
                    <p className="mt-1 text-xs">
                      {query
                        ? "Try a different name, username, or website."
                        : admin
                          ? "Use Add Login to save an account."
                          : "Your administrator can add logins."}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>
          <section
            aria-label="Account details"
            className={`${panel === "details" ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}
          >
            <div className="vault-pane-bar flex items-center justify-between gap-2 px-4 md:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label="Back to accounts"
                  onClick={() => setMobilePanel("accounts")}
                >
                  <ArrowLeft />
                </Button>
                <span className="truncate text-xs text-muted-foreground">
                  {project ? `${project.name} / Login` : "Login details"}
                </span>
              </div>
              {account && project && admin && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditor({ kind: "account", project, account })
                    }
                  >
                    <Pencil />
                    Edit
                  </Button>
                  <LoginActions
                    onRefreshIcon={
                      admin && !account.icon
                        ? () => onRefreshIcon(account.id)
                        : undefined
                    }
                    onEdit={() =>
                      setEditor({ kind: "account", project, account })
                    }
                    onCopyUsername={() =>
                      void copyCredential(account.email, "Username")
                    }
                    onDelete={() =>
                      setEditor({
                        kind: "delete",
                        path: `/api/accounts/${account.id}`,
                        title: `Delete ${account.label}?`,
                      })
                    }
                  />
                </div>
              )}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {account && project ? (
                <div className="vault-detail mx-auto max-w-3xl">
                  <LoginHeading
                    title={
                      account.label === account.email
                        ? project.name
                        : account.label
                    }
                    icon={account.icon}
                    website={accountWebsites(account, project)[0]?.url}
                    favicon={account.favicon}
                  >
                    {account.is_default && (
                      <Badge variant="secondary" className="ml-auto">
                        Default
                      </Badge>
                    )}
                  </LoginHeading>
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
                      <AccountPassword
                        key={`${account.id}:${account.updated_at}`}
                        accountId={account.id}
                      />
                    ) : (
                      <CredentialRow label="Sign-in method">
                        Google sign-in
                      </CredentialRow>
                    )}
                  </div>
                  <dl className="mt-4 divide-y">
                    <Field label="Websites">
                      {accountWebsites(account, project).length ? (
                        accountWebsites(account, project).map((site) => (
                          <a
                            key={site.url}
                            href={
                              site.login_path
                                ? new URL(site.login_path, site.url).href
                                : site.url
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-4 py-1 text-[var(--vault-label)] hover:underline"
                          >
                            <span>
                              {new URL(site.url).host}
                              {new URL(site.url).pathname.replace(/\/$/, "")}
                            </span>
                            <ExternalLink
                              aria-label="Open website"
                              className="size-4 shrink-0"
                            />
                          </a>
                        ))
                      ) : (
                        <span className="text-muted-foreground">
                          No websites configured
                        </span>
                      )}
                    </Field>
                    {account.tags?.length ? (
                      <Field label="Tags">{account.tags.join(" · ")}</Field>
                    ) : null}
                    {account.notes && (
                      <Field label="Notes">
                        <span className="whitespace-pre-wrap">
                          {account.notes}
                        </span>
                      </Field>
                    )}
                    <Field label="Project">
                      <span className="flex items-center gap-2">
                        <ItemIcon icon={project.icon} folder />
                        {project.name}
                      </span>
                    </Field>
                  </dl>
                  <Files key={account.id} accountId={account.id} />
                  <LoginActivity
                    key={account.id}
                    id={account.id}
                    stamp={account.updated_at}
                    created={account.created_at}
                    request={orgRequest}
                  />
                </div>
              ) : selected || query || accountId ? (
                <div className="library-overview">
                  <span className="library-emblem">
                    <List />
                  </span>
                  <h1>Select an account</h1>
                  <p>{selected?.name ?? "All logins"}</p>
                </div>
              ) : (
                overview("projects")
              )}
            </ScrollArea>
          </section>
        </>
      )}
    </div>
  )
}
