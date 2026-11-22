import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuContent,
} from "@workspace/ui/components/dropdown-menu"
import { useState, useEffect, useRef } from "react"
import { apiRequest } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  File,
  Upload,
  Paperclip,
  Pencil,
  Trash2,
  Unlink,
  LockKeyhole,
} from "lucide-react"
type FileInfo = {
  id: string
  name: string
  size: number
  account_id?: string | null
}
const list = () => apiRequest<FileInfo[]>("", "/api/files")
export function Files({ accountId }: { accountId?: string } = {}) {
  const picker = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<FileInfo[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(""),
    [name, setName] = useState(""),
    [remove, setRemove] = useState("")
  useEffect(() => {
    let live = true
    function reload() {
      list()
        .then((r) => {
          if (live) setRows(r)
        })
        .catch((e) => {
          if (live) setError(e.message)
        })
    }
    reload()
    window.addEventListener("vault-files-changed", reload)
    return () => {
      window.removeEventListener("vault-files-changed", reload)
      live = false
    }
  }, [])
  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await fn()
      window.dispatchEvent(new Event("vault-files-changed"))
      setEdit("")
      setRemove("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      className={accountId ? "login-files" : "mx-auto grid max-w-2xl gap-4 p-6"}
    >
      <header className="flex flex-wrap items-center gap-2">
        <Paperclip size={16} />
        <h2 className="mr-auto font-semibold">
          {accountId ? "My attachments" : "File attachments"}
        </h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          <Upload />
          Upload file
        </Button>
      </header>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <LockKeyhole size={13} className="shrink-0" />
        Only you can access these files. Up to 50 MB per file.
      </p>
      <input
        ref={picker}
        hidden
        aria-label="Upload a private file"
        type="file"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (!f) return
          if (f.size > 50 * 1024 * 1024) {
            setError("Maximum file size is 50 MB")
            return
          }
          void act(async () => {
            const res = await fetch(
              "/api/files?name=" +
                encodeURIComponent(f.name) +
                (accountId ? "&account=" + encodeURIComponent(accountId) : ""),
              {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream" },
                body: f,
              }
            )
            if (!res.ok)
              throw new Error(
                (await res.json().catch(() => ({}))).error ?? "Upload failed"
              )
          })
        }}
      />

      {accountId && rows.some((f) => !f.account_id) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                className="justify-self-start"
              />
            }
          >
            <Paperclip />
            Attach existing file
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-64 max-w-[min(20rem,85vw)] overflow-y-auto"
          >
            {rows
              .filter((f) => !f.account_id)
              .map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() =>
                    void act(() =>
                      apiRequest("", "/api/files/" + f.id, {
                        method: "PATCH",
                        body: JSON.stringify({ account_id: accountId }),
                      })
                    )
                  }
                >
                  <File />
                  <span className="truncate">{f.name}</span>
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      {rows
        .filter((f) => !accountId || f.account_id === accountId)
        .map((f) => (
          <div
            key={f.id}
            className="flex flex-wrap items-center gap-2 border-b py-2"
          >
            {edit === f.id ? (
              <>
                <Input
                  aria-label="Filename"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      apiRequest("", "/api/files/" + f.id, {
                        method: "PATCH",
                        body: JSON.stringify({ name }),
                      })
                    )
                  }
                >
                  Save name
                </Button>
              </>
            ) : (
              <a
                className="mr-auto inline-flex max-w-full min-w-0 items-center gap-2 text-primary hover:underline"
                href={"/api/files/" + f.id}
                download
              >
                <File size={15} className="shrink-0" />
                <span className="truncate">{f.name}</span>
              </a>
            )}
            <small>{Math.ceil(f.size / 1024)} KB</small>
            <Button
              type="button"
              size="icon-sm"
              title={"Rename " + f.name}
              aria-label={"Rename " + f.name}
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEdit(f.id)
                setName(f.name)
              }}
            >
              <Pencil />
            </Button>
            <Button
              type="button"
              size={remove === f.id ? "sm" : "icon-sm"}
              title={accountId ? "Detach file" : "Delete file"}
              aria-label={
                (accountId
                  ? "Detach "
                  : remove === f.id
                    ? "Confirm delete "
                    : "Delete ") + f.name
              }
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (accountId) {
                  void act(() =>
                    apiRequest("", "/api/files/" + f.id, {
                      method: "PATCH",
                      body: JSON.stringify({ account_id: null }),
                    })
                  )
                  return
                }
                if (remove !== f.id) {
                  setRemove(f.id)
                  return
                }
                void act(() =>
                  apiRequest("", "/api/files/" + f.id, { method: "DELETE" })
                )
              }}
            >
              {accountId ? (
                <Unlink />
              ) : remove === f.id ? (
                "Confirm delete"
              ) : (
                <Trash2 />
              )}
            </Button>
          </div>
        ))}
    </section>
  )
}
