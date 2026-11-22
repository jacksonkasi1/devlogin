import { useState } from "react"
import type { Collection, Project } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { IconPicker } from "@workspace/ui/components/item-icon"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Choice } from "@workspace/ui/components/credential-editors"

export function CollectionEditor({
  collection,
  projects,
  request,
  refresh,
  close,
}: {
  collection?: Collection
  projects: Project[]
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>
  refresh: () => Promise<unknown>
  close: () => void
}) {
  const [name, setName] = useState(collection?.name ?? "")
  const [tag, setTag] = useState(collection?.tag ?? "")
  const [icon, setIcon] = useState(collection?.icon ?? "")
  const [scope, setScope] = useState(collection?.project_id ?? "all")
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  async function save() {
    setBusy(true)
    setError("")
    try {
      await request(
        "/api/collections" + (collection ? "/" + collection.id : ""),
        collection ? "PUT" : "POST",
        {
          name: name.trim(),
          tag: tag.trim() || name.trim(),
          icon,
          project_id: scope === "all" ? null : scope,
        }
      )
      await refresh()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save collection")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {collection ? "Edit collection" : "New collection"}
          </DialogTitle>
          <DialogDescription>
            Group workspace logins and projects by a shared tag.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="flex items-center gap-3">
            <IconPicker folder value={icon} onChange={setIcon} />
            <label className="min-w-0 flex-1">
              Collection name
              <Input
                autoFocus
                required
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>
          <label>
            Membership tag
            <Input
              required={name.trim().length > 48}
              maxLength={48}
              value={tag}
              placeholder={name.trim() || "Defaults to the collection name"}
              onChange={(e) => setTag(e.target.value)}
            />
          </label>
          <div>
            <span>Scope</span>
            <Choice
              label="Collection scope"
              value={scope}
              options={[
                { value: "all", label: "Across projects" },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
              onChange={setScope}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy
                ? "Saving…"
                : collection
                  ? "Save changes"
                  : "Create collection"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
