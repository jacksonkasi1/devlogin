import { send } from "./client"
import { openSetup } from "./setup-checklist"
import { Button } from "@workspace/ui/components/button"
import { VaultMark } from "@workspace/ui/components/vault"

export function Onboarding({
  busy,
  act,
}: {
  busy: boolean
  act: (action: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-xs flex-col items-center gap-5 text-center">
        <VaultMark />
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold">Welcome to Global Login</h1>
          <p className="text-sm text-muted-foreground">
            Set up the extension to access your team’s shared logins.
          </p>
        </div>
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => void act(openSetup)}
        >
          Get started
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void act(() => send({ type: "login" }))}
        >
          Continue with Google
        </Button>
      </div>
    </section>
  )
}
