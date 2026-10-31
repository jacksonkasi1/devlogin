import { useEffect, useState } from "react"
import { apiRequest } from "@workspace/shared"
import { Copy, Eye, EyeOff } from "lucide-react"
import { IconAction } from "./workspace-management"
import { toast } from "@workspace/ui/components/sonner"

export const readNote = async (noteId: string) =>
  (
    await apiRequest<{ content: string }>("", `/api/notes/${noteId}/content`, {
      method: "POST",
      body: "{}",
    })
  ).content

export function NoteContent({ noteId }: { noteId: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (content === null) return
    const timer = setTimeout(() => setContent(null), 30_000)
    const hide = () => {
      if (document.visibilityState === "hidden") setContent(null)
    }
    document.addEventListener("visibilitychange", hide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", hide)
    }
  }, [content])
  async function read(copy: boolean) {
    setBusy(true)
    try {
      const value = await readNote(noteId)
      if (copy) {
        await navigator.clipboard.writeText(value)
        toast.success("Note copied")
      } else setContent(value)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not decrypt")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0 flex-1">
        <dt className="mb-1 text-xs text-muted-foreground">Secure note</dt>
        <dd
          className="font-mono text-sm break-words whitespace-pre-wrap"
          aria-label="Secure note"
        >
          {content ?? "••••••••••••"}
        </dd>
      </div>
      <div className="flex shrink-0 gap-1">
        <IconAction
          label={content === null ? "Show note" : "Hide note"}
          disabled={busy}
          onClick={() =>
            content === null ? void read(false) : setContent(null)
          }
        >
          {content === null ? <Eye /> : <EyeOff />}
        </IconAction>
        <IconAction
          label="Copy note"
          disabled={busy}
          onClick={() => void read(true)}
        >
          <Copy />
        </IconAction>
      </div>
    </div>
  )
}
