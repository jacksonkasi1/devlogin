import { useEffect, useState, type ReactNode } from "react"
import {
  type Collection,
  accountSchema,
  projectSchema,
  type Project,
  type Account,
  type Website,
} from "@workspace/shared"
import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"
import { Switch } from "./switch"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./select"
import { toast } from "./sonner"
import { Textarea } from "./textarea"
import { IconPicker, ItemIcon } from "./item-icon"
import { copyCredential } from "./vault"
import {
  Eye,
  EyeOff,
  Copy,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  CircleMinus,
} from "lucide-react"
export function Choice({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: { value: string; label: ReactNode }[]
  onChange: (value: string) => void
  label: string
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(value) => {
        if (value !== null) onChange(value)
      }}
    >
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
export function Field({
  name,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
    </div>
  )
}
function Memberships({
  groups,
  tags,
  change,
}: {
  groups: Collection[]
  tags: string
  change: (value: string) => void
}) {
  if (!groups.length) return null
  const values = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
  return (
    <fieldset className="collection-members">
      <legend>Collections</legend>
      {groups.map((g) => (
        <label key={g.id}>
          <input
            type="checkbox"
            checked={values.some(
              (v) => v.toLowerCase() === g.tag.toLowerCase()
            )}
            onChange={(e) =>
              change(
                (e.target.checked
                  ? [...values, g.tag]
                  : values.filter(
                      (v) => v.toLowerCase() !== g.tag.toLowerCase()
                    )
                ).join(", ")
              )
            }
          />
          {g.icon && <ItemIcon small icon={g.icon} folder />}
          {g.name}
        </label>
      ))}
    </fieldset>
  )
}
export function ProjectEditor({
  project,
  groups = [],
  onSave,
  onCancel,
  busy,
}: {
  groups?: Collection[]
  project?: Project
  website?: string
  onSave: (body: unknown) => void
  onCancel: () => void
  busy: boolean
}) {
  const [name, setName] = useState(project?.name ?? "")
  const [description, setDescription] = useState(project?.description ?? "")
  const [icon, setIcon] = useState(project?.icon ?? "")
  const [tags, setTags] = useState((project?.tags ?? []).join(", "))
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const result = projectSchema.safeParse({
          name,
          description,
          icon,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        })
        if (!result.success) {
          toast.error(result.error.issues[0]?.message ?? "Check project fields")
          return
        }
        onSave({
          name: result.data.name,
          description,
          icon,
          tags: result.data.tags,
        })
      }}
    >
      <Memberships
        groups={groups.filter((g) => !g.project_id)}
        tags={tags}
        change={setTags}
      />
      <IconPicker value={icon} onChange={setIcon} folder />
      <Field
        name="tags"
        label="Tags (comma separated)"
        value={tags}
        onChange={setTags}
      />
      <Field
        name="name"
        label="Project name"
        value={name}
        onChange={setName}
        required
      />
      <div className="space-y-1">
        <Label htmlFor="description">
          Description <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : project ? "Save Project" : "Create Project"}
        </Button>
      </div>
    </form>
  )
}
export function AccountEditor({
  account,
  attachments,
  groups = [],
  loadPassword,
  projectId,
  environments = [],
  projects = [],
  website,
  onSave,
  onCancel,
  busy,
}: {
  attachments?: ReactNode
  groups?: Collection[]
  loadPassword?: () => Promise<string>
  account?: Account
  projectId: string
  environments?: string[]
  projects?: Project[]
  website?: string
  onSave: (body: unknown) => void
  onCancel: () => void
  busy: boolean
}) {
  const [label, setLabel] = useState(account?.label ?? "")
  const [email, setEmail] = useState(account?.email ?? "")
  const [password, setPassword] = useState("")
  const [type, setType] = useState(account?.login_type ?? "password")
  const [isDefault, setDefault] = useState(account?.is_default ?? false)
  const [selectedProject, setProject] = useState(projectId)
  const [notes, setNotes] = useState(account?.notes ?? "")
  const [icon, setIcon] = useState(account?.icon ?? "")
  const [tags, setTags] = useState((account?.tags ?? []).join(", "))
  const [websites, setWebsites] = useState<Website[]>(
    () =>
      account?.websites ??
      (account?.environment
        ? [{ url: account.environment }]
        : (website ? [website] : environments).map((url) => ({ url })))
  )
  const [show, setShow] = useState(false)
  const [stored, setStored] = useState("")
  const [reading, setReading] = useState(false)
  useEffect(() => {
    if (!stored) return
    const hide = () => {
      setStored("")
      setShow(false)
    }
    const timer = setTimeout(hide, 30000)
    document.addEventListener("visibilitychange", hide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", hide)
    }
  }, [stored])
  async function readSecret(copy: boolean) {
    if (!copy && show) {
      setShow(false)
      setStored("")
      return
    }
    setReading(true)
    try {
      const value =
        password ||
        stored ||
        (account?.login_type === "password" && loadPassword
          ? await loadPassword()
          : "")
      if (copy) await copyCredential(value, "Password")
      else {
        if (!password) setStored(value)
        setShow(true)
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not retrieve password"
      )
    } finally {
      setReading(false)
    }
  }
  const updateSite = (index: number, change: Partial<Website>) =>
    setWebsites((items) =>
      items.map((site, i) => (i === index ? { ...site, ...change } : site))
    )
  return (
    <form
      className="login-editor"
      onSubmit={(event) => {
        event.preventDefault()
        const result = accountSchema.safeParse({
          project_id: selectedProject,
          label,
          email,
          notes,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          icon,
          websites: websites.filter((site) => site.url.trim()),
          login_type: type,
          is_default: isDefault,
          ...(password && type === "password" ? { password } : {}),
        })
        if (!result.success) {
          toast.error(result.error.issues[0]?.message ?? "Check login fields")
          return
        }
        onSave(result.data)
      }}
    >
      <div className="login-editor-fields">
        <div className="login-editor-title">
          <IconPicker
            value={icon}
            onChange={setIcon}
            website={websites.find((site) => site.url.trim())?.url}
          />
          <div className="min-w-0 flex-1">
            <Field
              name="label"
              label="Title"
              value={label}
              onChange={setLabel}
              placeholder="Enter a title"
              required
            />
          </div>
        </div>
        <div className="login-editor-group">
          <Field
            name="email"
            label="Username / Email"
            value={email}
            onChange={setEmail}
            required
          />
          {type === "password" && (
            <div className="login-editor-field">
              <Label htmlFor="password">Password</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  placeholder={
                    account?.login_type === "password"
                      ? "••••••••••••"
                      : undefined
                  }
                  disabled={reading}
                  value={password || stored}
                  onChange={(event) => {
                    setStored("")
                    setPassword(event.target.value)
                  }}
                  autoComplete="new-password"
                  required={!account || account.login_type === "google"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={show ? "Hide password" : "Show password"}
                  disabled={reading}
                  onClick={() => void readSecret(false)}
                >
                  {show ? <EyeOff /> : <Eye />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Copy password"
                  disabled={reading || (!password && !loadPassword)}
                  onClick={() => void readSecret(true)}
                >
                  <Copy />
                </Button>
              </div>
              {account && (
                <p className="text-xs text-muted-foreground">
                  Leave blank to keep the current password.
                </p>
              )}
            </div>
          )}
        </div>
        <details className="login-editor-options">
          <summary>
            Login options <ChevronDown size={14} />
          </summary>
          <div className="space-y-3 p-3">
            <Label>Login type</Label>
            <Choice
              label="Login type"
              value={type}
              options={[
                { value: "password", label: "Password" },
                { value: "google", label: "Google" },
              ]}
              onChange={(value) => setType(value as "password" | "google")}
            />
            <div className="flex items-center gap-2">
              <Switch
                id="default-account"
                checked={isDefault}
                onCheckedChange={setDefault}
              />
              <Label htmlFor="default-account">Default account</Label>
            </div>
          </div>
        </details>
        <div className="login-editor-websites">
          <Label className="px-3 py-2">Websites</Label>
          {(websites.length ? websites : [{ url: "" }]).map((site, index) => (
            <div key={index} className="login-editor-website">
              <div className="flex min-w-0 items-center gap-1">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`website-${index}`}>
                    Website URL {index + 1}
                  </Label>
                  <Input
                    id={`website-${index}`}
                    placeholder="https://example.com"
                    value={site.url}
                    onChange={(event) =>
                      websites.length
                        ? updateSite(index, { url: event.target.value })
                        : setWebsites([{ url: event.target.value }])
                    }
                  />
                </div>
              </div>
              <details className="login-editor-site-options">
                <summary
                  aria-label={`Advanced website settings ${index + 1}`}
                  title="Advanced website settings"
                >
                  <SlidersHorizontal size={15} />
                </summary>
                <div className="mt-2 space-y-2">
                  <Field
                    name={`path-${index}`}
                    label="Login path (optional)"
                    value={site.login_path ?? ""}
                    onChange={(value) =>
                      updateSite(index, { login_path: value || undefined })
                    }
                    placeholder="/login"
                  />
                  {(["email", "password", "submit", "google"] as const).map(
                    (key) => (
                      <Field
                        key={key}
                        name={`selector-${index}-${key}`}
                        label={`${key} selector (optional)`}
                        value={site.selectors?.[key] ?? ""}
                        onChange={(value) =>
                          updateSite(index, {
                            selectors: {
                              ...(site.selectors ?? {
                                email: "",
                                password: "",
                                submit: "",
                                google: "",
                              }),
                              [key]: value,
                            },
                          })
                        }
                      />
                    )
                  )}
                </div>
              </details>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="login-editor-website-remove text-destructive"
                aria-label={`Remove website ${index + 1}`}
                onClick={() =>
                  setWebsites((items) => items.filter((_, i) => i !== index))
                }
              >
                <CircleMinus />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="login-editor-add"
            onClick={() =>
              setWebsites((items) => [
                ...(items.length ? items : [{ url: "" }]),
                { url: "" },
              ])
            }
          >
            <Plus />
            Add another website
          </Button>
        </div>
        <Field
          name="tags"
          label="Tags (comma separated)"
          value={tags}
          onChange={setTags}
        />
        <Memberships
          groups={groups.filter(
            (g) => !g.project_id || g.project_id === selectedProject
          )}
          tags={tags}
          change={setTags}
        />
        {attachments}
        <div className="login-editor-notes">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            placeholder="Add notes about this login"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </div>
      <div className="login-editor-footer">
        {projects.length > 0 && (
          <div className="mr-auto min-w-36">
            <Choice
              label="Project"
              value={selectedProject}
              options={projects.map((p) => ({
                value: p.id,
                label: (
                  <span className="flex items-center gap-2">
                    <ItemIcon icon={p.icon} folder small />
                    {p.name}
                  </span>
                ),
              }))}
              onChange={setProject}
            />
          </div>
        )}
        <Button
          disabled={busy}
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save Login"}
        </Button>
      </div>
    </form>
  )
}
