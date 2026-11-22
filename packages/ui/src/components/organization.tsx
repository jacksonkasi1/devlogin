import { useEffect, useState } from "react"
import { ListFilter } from "lucide-react"
import type { Collection, SortOrder } from "@workspace/shared"
import { Button } from "./button"
import { Input } from "./input"
import { Popover, PopoverTrigger, PopoverContent } from "./popover"
type Request = <T>(path: string, method?: string, body?: unknown) => Promise<T>
export function OrganizationMenu({
  groups,
  group,
  change,
  sort,
  onSort,
  request,
  editable,
  refresh,
}: {
  groups: Collection[]
  group: string
  change: (id: string) => void
  sort: SortOrder
  onSort: (order: SortOrder) => void
  request: Request
  editable: boolean
  refresh: () => Promise<unknown>
}) {
  const [name, setName] = useState(""),
    [tag, setTag] = useState(""),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const current = groups.find((g) => g.id === group)
  async function save(remove = false) {
    setBusy(true)
    setError("")
    try {
      const row = await request<Collection>(
        "/api/collections" + (editing && current ? "/" + current.id : ""),
        remove ? "DELETE" : editing ? "PUT" : "POST",
        remove ? undefined : { name, tag: tag || name }
      )
      await refresh()
      change(remove ? "" : row.id)
      setName("")
      setTag("")
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save collection")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Collections and sort order"
          />
        }
      >
        <ListFilter />
      </PopoverTrigger>
      <PopoverContent className="grid w-64 gap-3 p-3 text-sm">
        <label>
          Sort by
          <select
            className="block w-full rounded border bg-background p-1"
            value={sort}
            onChange={(e) => onSort(e.target.value as SortOrder)}
          >
            {Object.entries({
              priority: "Suggested / default",
              updated: "Last edited",
              newest: "Newest first",
              oldest: "Oldest first",
              name: "Name A–Z",
            }).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label>
          Collection
          <select
            className="block w-full rounded border bg-background p-1"
            value={group}
            onChange={(e) => {
              change(e.target.value)
              setEditing(false)
              setName("")
              setTag("")
            }}
          >
            <option value="">All collections</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        {current && (
          <p>
            Includes logins and projects tagged <strong>{current.tag}</strong>.
          </p>
        )}
        {editable && (
          <details>
            <summary>Manage collections</summary>
            <div className="mt-2 grid gap-2">
              {current && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(true)
                    setName(current.name)
                    setTag(current.tag)
                  }}
                >
                  Edit selected collection
                </Button>
              )}
              <Input
                placeholder="Collection name"
                aria-label="Collection name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                placeholder="Membership tag (defaults to name)"
                aria-label="Membership tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <Button
                disabled={busy || !name.trim()}
                onClick={() => void save()}
              >
                {editing ? "Save changes" : "Create collection"}
              </Button>
              {editing && (
                <Button
                  disabled={busy}
                  variant="ghost"
                  onClick={() => void save(true)}
                >
                  Delete collection
                </Button>
              )}
            </div>
          </details>
        )}
        {error && <p role="alert">{error}</p>}
      </PopoverContent>
    </Popover>
  )
}
type EventRow = {
  id: number
  source: string
  action: string
  fields: string[]
  at: string
  name: string
  email: string
  avatar: string | null
}
function Actor({ event }: { event: EventRow }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
            title={event.name + " · " + event.email}
          />
        }
      >
        {event.avatar ? (
          <img
            alt=""
            referrerPolicy="no-referrer"
            src={event.avatar}
            className="size-4 rounded-full"
          />
        ) : (
          <span aria-hidden>{event.name.slice(0, 1)}</span>
        )}
        {event.name}
      </PopoverTrigger>
      <PopoverContent>
        {event.name}
        <br />
        {event.email}
      </PopoverContent>
    </Popover>
  )
}
export function LoginActivity({
  id,
  stamp,
  created,
  request,
}: {
  id: string
  stamp: string
  created: string
  request: Request
}) {
  const [data, setData] = useState<{
      created: EventRow | null
      rows: EventRow[]
    }>(),
    [error, setError] = useState("")
  useEffect(() => {
    let live = true
    request<{ created: EventRow | null; rows: EventRow[] }>(
      "/api/activity/" + id
    )
      .then((d) => {
        if (live) setData(d)
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [id, stamp, request])
  return (
    <div className="mt-5 grid gap-1 text-xs text-muted-foreground">
      <p>
        Added {new Date(created).toLocaleString()}{" "}
        {data?.created && (
          <>
            by <Actor event={data.created} />
          </>
        )}
      </p>
      <details>
        <summary>
          Last updated {new Date(stamp).toLocaleString()} · Activity
        </summary>
        {error && <p>{error}</p>}
        {data?.rows.map((e) => (
          <div key={e.id} className="my-2 border-l pl-2">
            <Actor event={e} /> · {e.source}
            <br />
            {e.action} {e.fields.join(", ")}
            <br />
            {new Date(e.at).toLocaleString()}
          </div>
        ))}
        {data && !data.created && <p>Original creator was not recorded.</p>}
      </details>
    </div>
  )
}
