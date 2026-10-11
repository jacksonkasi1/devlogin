import { useEffect, useState } from "react"
import { Button } from "./button"
import { Input } from "./input"
import { toast } from "./sonner"

export function AccountSecret({ reveal }: { reveal: () => Promise<string> }) {
  const [password, setPassword] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (password === null) return
    const timeout = setTimeout(() => setPassword(null), 30_000)
    return () => clearTimeout(timeout)
  }, [password])
  const read = async (copy: boolean) => {
    setBusy(true)
    try {
      const value = await reveal()
      if (copy) {
        await navigator.clipboard.writeText(value)
        toast.success("Password copied")
      } else setPassword(value)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not retrieve password"
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label="Password"
        className="w-40"
        readOnly
        type={password === null ? "password" : "text"}
        value={password ?? "••••••••"}
      />
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          password === null ? void read(false) : setPassword(null)
        }
      >
        {password === null ? "Show" : "Hide"}
      </Button>
      <Button variant="ghost" disabled={busy} onClick={() => void read(true)}>
        Copy password
      </Button>
    </div>
  )
}
