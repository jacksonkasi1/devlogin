import { useRef, useState } from "react"
import { apiRequest, type User } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { toast } from "@workspace/ui/components/sonner"

export function BackupPanel({
  user,
  onImported,
}: {
  user: User
  onImported: () => void
}) {
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  if (!user.is_admin && !user.can_backup) return null
  async function exportAll() {
    setBusy(true)
    try {
      const data = await apiRequest<unknown>("", "/api/backup")
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = `devlogin-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success("Backup downloaded. It contains passwords: keep it safe.")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Export failed")
    } finally {
      setBusy(false)
    }
  }
  async function importFile(file: File) {
    setBusy(true)
    try {
      const body = JSON.parse(await file.text())
      const result = await apiRequest<{ projects: number; accounts: number }>(
        "",
        "/api/backup/import",
        { method: "POST", body: JSON.stringify(body) }
      )
      toast.success(
        `Imported ${result.projects} projects and ${result.accounts} logins`
      )
      onImported()
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Import failed")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>
          Export every project and login (including passwords) to a JSON file,
          or import one. Import adds and updates items; it never deletes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void exportAll()}
        >
          Export everything
        </Button>
        {(user.is_admin || user.can_edit) && (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              Import backup
            </Button>
            <input
              ref={input}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importFile(file)
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
