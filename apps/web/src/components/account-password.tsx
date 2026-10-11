import { useEffect, useState } from "react"
import { apiRequest } from "@workspace/shared"
import { Copy, Eye, EyeOff } from "lucide-react"
import { IconAction } from "./workspace-management"
import { toast } from "@workspace/ui/components/sonner"

export function AccountPassword({ accountId }: { accountId: string }) {
  const [password, setPassword] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (password === null) return
    const timer = setTimeout(() => setPassword(null), 30_000)
    const hide = () => {
      if (document.visibilityState === "hidden") setPassword(null)
    }
    document.addEventListener("visibilitychange", hide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", hide)
    }
  }, [password])
  async function read(copy: boolean) {
    setBusy(true)
    try {
      const result = await apiRequest<{ password: string }>(
        "",
        `/api/accounts/${accountId}/password`,
        { method: "POST", body: "{}" }
      )
      if (copy) {
        await navigator.clipboard.writeText(result.password)
        toast.success("Password copied")
      } else setPassword(result.password)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not retrieve password"
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <dt className="mb-1 text-xs text-muted-foreground">Password</dt>
        <dd className="font-mono text-sm break-all" aria-label="Password">
          {password ?? "••••••••••••"}
        </dd>
      </div>
      <div className="flex shrink-0 gap-1">
        <IconAction
          label={password === null ? "Show password" : "Hide password"}
          disabled={busy}
          onClick={() =>
            password === null ? void read(false) : setPassword(null)
          }
        >
          {password === null ? <Eye /> : <EyeOff />}
        </IconAction>
        <IconAction
          label="Copy password"
          disabled={busy}
          onClick={() => void read(true)}
        >
          <Copy />
        </IconAction>
      </div>
    </div>
  )
}
