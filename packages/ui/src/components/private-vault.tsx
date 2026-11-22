import { useEffect, useState } from "react"
import {
  personalFields,
  categoryNames,
  personalKinds,
  generatePassword,
  type PersonalSummary,
  type PersonalItem,
  type PersonalKind,
} from "@workspace/shared"
import { Button } from "./button"
import { Input } from "./input"
import { Textarea } from "./textarea"
import { IconPicker } from "./item-icon"
import { copyCredential } from "./vault"
import { toast } from "./sonner"

type Request = <T>(path: string, method?: string, body?: unknown) => Promise<T>
type ProfileAction = (
  fields?: Record<string, string>
) => Promise<Record<string, string>>
const base = "/api/personal-items"
const empty = (kind: PersonalKind): PersonalItem => ({
  id: "",
  kind,
  title: "",
  icon: "",
  tags: [],
  fields: {},
})
export function VaultTools({
  request,
  initial,
  browseProfiles,
  profileAction,
  site,
}: {
  request: Request
  initial?: PersonalKind | "generator"
  profileAction?: ProfileAction
  browseProfiles?: boolean
  site?: string
}) {
  const [kind, setKind] = useState<PersonalKind | "generator">(
    browseProfiles ? "profile" : (initial ?? "note")
  )
  const [rows, setRows] = useState<PersonalSummary[]>([])
  const [draft, setDraft] = useState<PersonalItem | null>(
    !browseProfiles && initial && initial !== "generator"
      ? empty(initial)
      : null
  )
  const [tags, setTags] = useState("")
  const [error, setError] = useState("")
  const [files, setFiles] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    if (kind === "document")
      void request<{ id: string; name: string }[]>("/api/files")
        .then(setFiles)
        .catch((e) => setError(e.message))
  }, [kind, request])
  const [query, setQuery] = useState("")
  const [secret, setSecret] = useState("")
  const [length, setLength] = useState(24)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [show, setShow] = useState(false)
  useEffect(() => {
    let live = true
    request<PersonalSummary[]>(base)
      .then((data) => {
        if (live) setRows(data)
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [request])
  function select(item: PersonalItem | null) {
    setDraft(item)
    setTags(item?.tags?.join(", ") ?? "")
    setShow(false)
    setConfirmDelete(false)
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError("")
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete action")
    } finally {
      setBusy(false)
    }
  }
  function field(key: string, value: string) {
    setDraft((d) =>
      d ? { ...d, fields: { ...d.fields, [key]: value } } : null
    )
  }
  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4 p-4">
      <h1 className="text-xl font-semibold">My vault &amp; tools</h1>
      <label className="grid gap-1 text-sm">
        Category
        <select
          className="rounded-md border bg-background p-2"
          value={kind}
          disabled={busy}
          onChange={(e) => {
            setKind(e.target.value as typeof kind)
            select(null)
            setQuery("")
            setSecret("")
          }}
        >
          <option value="generator">Password generator</option>
          {personalKinds.map((k) => (
            <option key={k} value={k}>
              {categoryNames[k]}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {kind === "generator" ? (
        <>
          <label>
            Password length
            <Input
              type="number"
              min={16}
              max={128}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            />
          </label>
          <Button
            onClick={() => {
              const n = Math.min(128, Math.max(16, length))
              setLength(n)
              setSecret(generatePassword(n))
            }}
          >
            Generate password
          </Button>
          {secret && (
            <>
              <Input aria-label="Generated password" readOnly value={secret} />
              <Button
                variant="outline"
                onClick={() => void copyCredential(secret, "Password")}
              >
                Copy password
              </Button>
            </>
          )}
          <a
            href="https://10minutemail.com/"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            Open a temporary inbox at 10 Minute Mail ↗
          </a>
        </>
      ) : draft ? (
        <form
          autoComplete="off"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void run(async () => {
              await request(
                base + (draft.id ? "/" + draft.id : ""),
                draft.id ? "PUT" : "POST",
                {
                  kind,
                  title: draft.title,
                  icon: draft.icon,
                  tags: tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                  fields: draft.fields,
                }
              )
              setRows(await request(base))
              select(null)
              toast.success("Saved to your private vault")
            })
          }}
        >
          <IconPicker
            value={draft.icon}
            onChange={(icon) => setDraft({ ...draft, icon })}
          />
          <label>
            Title
            <Input
              required
              maxLength={120}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          {Object.entries(personalFields[draft.kind]).map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm">
              {label}
              {key === "attachment" ? (
                <select
                  aria-label="Attached file"
                  className="rounded-md border bg-background p-2"
                  value={draft.fields.attachment ?? ""}
                  onChange={(e) => field(key, e.target.value)}
                >
                  <option value="">Choose a file</option>
                  {files.map((f) => (
                    <option value={f.id} key={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              ) : [
                  "content",
                  "record",
                  "notes",
                  "street-address",
                  "private",
                  "public",
                ].includes(key) ? (
                <Textarea
                  value={draft.fields[key] ?? ""}
                  onChange={(e) => field(key, e.target.value)}
                />
              ) : (
                <Input
                  type={
                    !show && /password|number|token|passphrase|^key$/.test(key)
                      ? "password"
                      : "text"
                  }
                  value={draft.fields[key] ?? ""}
                  onChange={(e) => field(key, e.target.value)}
                />
              )}
            </label>
          ))}
          <label>
            Tags (comma separated)
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShow(!show)}
            >
              {show ? "Hide" : "Reveal"} sensitive fields
            </Button>
            {kind === "profile" && profileAction && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const fields = await profileAction()
                      setDraft({
                        ...draft,
                        fields: { ...draft.fields, ...fields },
                      })
                    })
                  }
                >
                  Read profile fields from {site}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await profileAction(draft.fields)
                      toast.success("Filled matching fields")
                    })
                  }
                >
                  Fill profile on {site}
                </Button>
              </>
            )}
            <Button disabled={busy}>Save</Button>
            <Button
              variant="ghost"
              type="button"
              disabled={busy}
              onClick={() => select(null)}
            >
              Cancel
            </Button>
            {draft.id && (
              <Button
                variant="destructive"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true)
                    return
                  }
                  void run(async () => {
                    await request(base + "/" + draft.id, "DELETE")
                    setRows(await request(base))
                    select(null)
                  })
                }}
              >
                {confirmDelete ? "Confirm delete" : "Delete"}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              aria-label="Search titles or tags"
              placeholder="Search titles or tags"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button onClick={() => select(empty(kind))}>
              Add {categoryNames[kind]}
            </Button>
          </div>
          {rows
            .filter(
              (r) =>
                r.kind === kind &&
                [r.title, ...(r.tags ?? [])]
                  .join(" ")
                  .toLowerCase()
                  .includes(query.toLowerCase())
            )
            .map((r) => (
              <Button
                key={r.id}
                variant="outline"
                className="justify-start"
                disabled={busy}
                onClick={() =>
                  void run(async () => select(await request(base + "/" + r.id)))
                }
              >
                {r.icon} {r.title}
              </Button>
            ))}
          {!rows.some((r) => r.kind === kind) && (
            <p className="text-sm text-muted-foreground">
              No saved items in this category.
            </p>
          )}
        </>
      )}
    </section>
  )
}
