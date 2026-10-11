import { useState, type ReactNode } from "react"
import {
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
import { Eye, EyeOff, Copy, Plus, X } from "lucide-react"
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
export function ProjectEditor({
  project,
  onSave,
  onCancel,
  busy,
}: {
  project?: Project
  website?: string
  onSave: (body: unknown) => void
  onCancel: () => void
  busy: boolean
}) {
  const [name, setName] = useState(project?.name ?? "")
  const [description, setDescription] = useState(project?.description ?? "")
  const [icon, setIcon] = useState(project?.icon ?? "")
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const result = projectSchema.safeParse({ name, description, icon })
        if (!result.success) {
          toast.error(result.error.issues[0]?.message ?? "Check project fields")
          return
        }
        onSave({ name: result.data.name, description, icon })
      }}
    >
      <IconPicker value={icon} onChange={setIcon} folder />
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
  projectId,
  environments = [],
  projects = [],
  website,
  onSave,
  onCancel,
  busy,
}: {
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
  const [websites, setWebsites] = useState<Website[]>(
    () =>
      account?.websites ??
      (account?.environment
        ? [{ url: account.environment }]
        : (website ? [website] : environments).map((url) => ({ url })))
  )
  const [show, setShow] = useState(false)
  const updateSite = (index: number, change: Partial<Website>) =>
    setWebsites((items) =>
      items.map((site, i) => (i === index ? { ...site, ...change } : site))
    )
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        const result = accountSchema.safeParse({
          project_id: selectedProject,
          label,
          email,
          notes,
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
      <div className="flex items-center gap-4">
        <IconPicker value={icon} onChange={setIcon} />
        <div className="min-w-0 flex-1">
          <Field
            name="label"
            label="Title"
            value={label}
            onChange={setLabel}
            placeholder="e.g. Vizfleet Admin"
            required
          />
        </div>
      </div>
      <Field
        name="email"
        label="Username / Email"
        value={email}
        onChange={setEmail}
        required
      />
      {type === "password" && (
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <div className="flex items-center gap-1">
            <Input
              id="password"
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required={!account || account.login_type === "google"}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Copy password"
              disabled={!password}
              onClick={() =>
                void navigator.clipboard.writeText(password).then(
                  () => toast.success("Password copied"),
                  () => toast.error("Clipboard unavailable")
                )
              }
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
      <div className="space-y-1">
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
      </div>
      <div className="space-y-2">
        <Label>Websites</Label>
        {(websites.length ? websites : [{ url: "" }]).map((site, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center gap-1">
              <Input
                aria-label={`Website URL ${index + 1}`}
                placeholder="https://example.com"
                value={site.url}
                onChange={(event) =>
                  websites.length
                    ? updateSite(index, { url: event.target.value })
                    : setWebsites([{ url: event.target.value }])
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove website ${index + 1}`}
                onClick={() =>
                  setWebsites((items) => items.filter((_, i) => i !== index))
                }
              >
                <X />
              </Button>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Advanced website settings
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
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
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
      <div className="space-y-1">
        <Label htmlFor="notes">
          Notes <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Login options
        </summary>
        <div className="mt-2 flex items-center gap-2">
          <Switch
            id="default-account"
            checked={isDefault}
            onCheckedChange={setDefault}
          />
          <Label htmlFor="default-account">Default account</Label>
        </div>
      </details>
      <div className="sticky -bottom-6 -mx-6 flex flex-wrap items-center justify-end gap-2 border-t bg-popover px-6 py-4">
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
