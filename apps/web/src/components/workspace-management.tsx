import { useState, type ReactNode } from "react"
import {
  apiRequest,
  accountWebsites,
  type Project,
  type Account,
  type Sync,
} from "@workspace/shared"
import {
  ArrowLeft,
  Copy,
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
import { AccountPassword } from "./account-password"
import { toast } from "@workspace/ui/components/sonner"

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
        className="max-h-[85dvh] overflow-y-auto sm:max-w-[540px]"
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
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          {editor?.kind === "project" && (
            <ProjectEditor
              key={editor.project?.id ?? "new"}
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
        <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
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
  onMove: (account: Account, project: Project) => void
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const projects = data?.projects ?? []
  const dragged = data?.accounts.find((a) => a.id === draggedId)
  const canDrop = (p: Project) =>
    admin && !loading && !moving && !!dragged && dragged.project_id !== p.id
  const query = search.trim().toLowerCase()
  const accounts = (data?.accounts ?? []).filter(
    (a) =>
      (!selected || a.project_id === selected.id) &&
      `${a.label} ${a.email} ${a.environment} ${projects.find((p) => p.id === a.project_id)?.name ?? ""}`
        .toLowerCase()
        .includes(query)
  )
  const account = accounts.find((a) => a.id === accountId)
  const project = projects.find((p) => p.id === account?.project_id)
  const panel = mobilePanel
  const chooseProject = (p: Project | null) => {
    setSelected(p)
    setAccountId(null)
    setMobilePanel("accounts")
  }
  const row =
    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside
        aria-label="Projects"
        className={`${panel === "projects" ? "flex" : "hidden"} w-full shrink-0 flex-col border-r bg-sidebar md:flex md:w-[190px] lg:w-[232px]`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground">
            PROJECTS
          </h2>
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
            <button
              className={`${row} ${!selected ? "bg-accent font-medium" : ""}`}
              aria-current={!selected ? "true" : undefined}
              onClick={() => chooseProject(null)}
            >
              <KeyRound className="size-4" />
              <span className="flex-1">All Logins</span>
              <span className="text-xs text-muted-foreground">
                {data?.accounts.length ?? 0}
              </span>
            </button>
            <Separator className="my-3" />
            {!data && loading
              ? Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="my-2 h-10" />
                ))
              : projects.map((p) => (
                  <button
                    key={p.id}
                    className={`${row} ${selected?.id === p.id ? "bg-accent font-medium" : ""} ${dropId === p.id ? "bg-accent ring-2 ring-primary ring-inset" : ""}`}
                    aria-current={selected?.id === p.id ? "true" : undefined}
                    onClick={() => chooseProject(p)}
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
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Shared workspace
        </div>
      </aside>
      <section
        aria-label="Accounts"
        className={`${panel === "accounts" ? "flex" : "hidden"} w-full shrink-0 flex-col border-r md:flex md:w-[280px] lg:w-[320px]`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
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
            {selected?.name ?? "All Logins"}
          </h2>
          <span className="text-xs text-muted-foreground">
            {accounts.length}
          </span>
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
                    <button
                      key={a.id}
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
                      className={`${row} py-3 ${account?.id === a.id ? "bg-accent ring-1 ring-border ring-inset" : ""} ${draggedId === a.id ? "opacity-50" : ""} ${admin && !moving ? "cursor-grab active:cursor-grabbing" : ""}`}
                      onClick={() => {
                        setAccountId(a.id)
                        setMobilePanel("details")
                      }}
                    >
                      <ItemIcon
                        key={`${a.icon}:${a.websites?.[0]?.url}`}
                        icon={a.icon}
                        website={accountWebsites(a, p)[0]?.url}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {a.label === a.email ? (p?.name ?? "Login") : a.label}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {a.email}
                        </span>
                      </span>
                    </button>
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
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6">
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
                onClick={() => setEditor({ kind: "account", project, account })}
              >
                <Pencil />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Login actions"
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() =>
                      setEditor({
                        kind: "delete",
                        path: `/api/accounts/${account.id}`,
                        title: `Delete ${account.label}?`,
                      })
                    }
                  >
                    <Trash2 />
                    Delete login
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {account && project ? (
            <div className="mx-auto max-w-3xl p-6 lg:p-10">
              <div className="mb-8 flex items-center gap-4">
                <ItemIcon
                  key={`${account.icon}:${account.websites?.[0]?.url}`}
                  icon={account.icon}
                  website={accountWebsites(account, project)[0]?.url}
                  large
                />
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold break-words">
                    {account.label === account.email
                      ? project.name
                      : account.label}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {project.name}
                  </p>
                </div>
                {account.is_default && (
                  <Badge variant="secondary" className="ml-auto">
                    Default
                  </Badge>
                )}
              </div>
              <dl className="divide-y border-y">
                <Field
                  label="Username"
                  actions={
                    <IconAction
                      label="Copy username"
                      onClick={() =>
                        void navigator.clipboard.writeText(account.email).then(
                          () => toast.success("Username copied"),
                          () => toast.error("Clipboard unavailable")
                        )
                      }
                    >
                      <Copy />
                    </IconAction>
                  }
                >
                  {account.email}
                </Field>
                {account.login_type === "password" ? (
                  <AccountPassword
                    key={`${account.id}:${account.updated_at}`}
                    accountId={account.id}
                  />
                ) : (
                  <Field label="Sign-in method">Google sign-in</Field>
                )}
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
                        className="flex items-center justify-between gap-4 py-1 text-primary hover:underline"
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
                {account.notes && (
                  <Field label="Notes">
                    <span className="whitespace-pre-wrap">{account.notes}</span>
                  </Field>
                )}
                <Field label="Project">
                  <span className="flex items-center gap-2">
                    <ItemIcon icon={project.icon} folder />
                    {project.name}
                  </span>
                </Field>
              </dl>
              <p className="mt-6 text-xs text-muted-foreground">
                Last updated {new Date(account.updated_at).toLocaleString()}
              </p>
            </div>
          ) : (
            <div className="flex min-h-[55dvh] flex-col items-center justify-center gap-3 p-6 text-center">
              <KeyRound className="size-8 text-muted-foreground/50" />
              <h2 className="text-sm font-medium">Select an account</h2>
              <p className="max-w-64 text-xs text-muted-foreground">
                Choose a login to view its details and securely copy
                credentials.
              </p>
            </div>
          )}
        </ScrollArea>
      </section>
    </div>
  )
}
