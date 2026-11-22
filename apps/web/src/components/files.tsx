import { useState, useEffect } from "react"
import { apiRequest } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
type FileInfo = {
  id: string
  name: string
  size: number
  account_id?: string | null
}
const list = () => apiRequest<FileInfo[]>("", "/api/files")
export function Files({ accountId }: { accountId?: string } = {}) {
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
      <h2 className="font-semibold">
        {accountId ? "My attachments" : "File attachments"}
      </h2>
      <label>
        Upload a private file (up to 50 MB)
        <Input
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
                  (accountId
                    ? "&account=" + encodeURIComponent(accountId)
                    : ""),
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
      </label>
      {accountId && rows.some((f) => !f.account_id) && (
        <select
          className="w-full rounded border bg-background p-2"
          aria-label="Attach existing private file"
          value=""
          disabled={busy}
          onChange={(e) => {
            const id = e.target.value
            if (id)
              void act(() =>
                apiRequest("", "/api/files/" + id, {
                  method: "PATCH",
                  body: JSON.stringify({ account_id: accountId }),
                })
              )
          }}
        >
          <option value="">Attach existing private file…</option>
          {rows
            .filter((f) => !f.account_id)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
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
                className="mr-auto text-primary underline"
                href={"/api/files/" + f.id}
                download
              >
                {f.name}
              </a>
            )}
            <small>{Math.ceil(f.size / 1024)} KB</small>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEdit(f.id)
                setName(f.name)
              }}
            >
              Rename
            </Button>
            <Button
              type="button"
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
              {accountId
                ? "Detach"
                : remove === f.id
                  ? "Confirm delete"
                  : "Delete"}
            </Button>
          </div>
        ))}
    </section>
  )
}
