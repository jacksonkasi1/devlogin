import type { Snapshot } from "./messages"
import { send } from "./client"
import { useSetupSteps } from "./setup-checklist"
import { Button } from "@workspace/ui/components/button"
import { KeyRound } from "@workspace/ui/components/devlogin-icons"

export function Onboarding({
  snapshot,
  busy,
  act,
}: {
  snapshot: Snapshot | null
  busy: boolean
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
}) {
  const steps = useSetupSteps(snapshot, act)
  return (
    <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-xs flex-col items-center gap-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="size-7" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold">Welcome to DevLogin</h1>
          <p className="text-sm text-muted-foreground">
            Sign in once to sync your team’s logins.
          </p>
        </div>
        <Button
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={() => void act(() => send({ type: "login" }))}
        >
          Continue with Google
        </Button>
        <ul className="w-full space-y-2 border-t pt-5 text-left text-sm">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3">
              <span
                aria-hidden
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                  step.done
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {step.done ? "✓" : ""}
              </span>
              <span className={step.done ? "text-muted-foreground" : ""}>
                {step.label}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Works on every website. No permissions to approve.
        </p>
      </div>
    </section>
  )
}
