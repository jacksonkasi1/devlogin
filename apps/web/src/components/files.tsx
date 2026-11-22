import { useState, useEffect } from "react"
import { apiRequest } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
type FileInfo = { id: string; name: string; size: number }
const list = () => apiRequest<FileInfo[]>("", "/api/files")
export function Files() {
  const [rows, setRows] = useState<FileInfo[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(""),
    [name, setName] = useState(""),
    [remove, setRemove] = useState("")
  useEffect(() => {
    let live = true
    list()
      .then((r) => {
        if (live) setRows(r)
      })
      .catch((e) => {
        if (live) setError(e.message)
      })
    return () => {
      live = false
    }
  }, [])
  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await fn()
      setRows(await list())
      setEdit("")
      setRemove("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mx-auto grid max-w-2xl gap-4 p-6">
      <h1 className="text-xl font-semibold">File attachments</h1>
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
                "/api/files?name=" + encodeURIComponent(f.name),
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
      {busy && <p role="status">Working…</p>}
      {error && <p role="alert">{error}</p>}
      {rows.map((f) => (
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
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (remove !== f.id) {
                setRemove(f.id)
                return
              }
              void act(() =>
                apiRequest("", "/api/files/" + f.id, { method: "DELETE" })
              )
            }}
          >
            {remove === f.id ? "Confirm delete" : "Delete"}
          </Button>
        </div>
      ))}
    </section>
  )
}
