import { useEffect, useState } from "react"
import { apiRequest } from "@workspace/shared"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { CredentialRow, copyCredential } from "@workspace/ui/components/vault"
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
      if (copy) await copyCredential(result.password, "Password")
      else setPassword(result.password)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not retrieve password"
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <CredentialRow
      label="Password"
      busy={busy}
      onCopy={() => void read(true)}
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={password === null ? "Show password" : "Hide password"}
          disabled={busy}
          onClick={() =>
            password === null ? void read(false) : setPassword(null)
          }
        >
          {password === null ? <Eye /> : <EyeOff />}
        </Button>
      }
    >
      {password ?? "••••••••••••"}
    </CredentialRow>
  )
}
