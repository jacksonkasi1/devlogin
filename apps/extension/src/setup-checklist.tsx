import { useEffect, useState } from "react"
import { browser } from "wxt/browser"
import type { Snapshot } from "./messages"
import { send } from "./client"
import { Button } from "@workspace/ui/components/button"

// Shown only while something is incomplete, and disappears once everything is done.
export function SetupChecklist({
  snapshot,
  busy,
  act,
}: {
  snapshot: Snapshot | null
  busy: boolean
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
}) {
  const [pinned, setPinned] = useState<boolean | null>(null)
  useEffect(() => {
    browser.action
      .getUserSettings?.()
      .then((settings) => setPinned(settings.isOnToolbar))
      .catch(() => setPinned(true))
  }, [])
  if (!snapshot) return null
  const steps = [
    {
      done: !!snapshot.user,
      label: "Sign in with Google",
      action: "Sign in",
      run: () => act(() => send({ type: "login" })),
    },
    {
      done: !!snapshot.monitoring,
      label: "Allow DevLogin on all websites",
      action: "Allow",
      run: () =>
        act(async () => {
          const granted = await browser.permissions.request({
            origins: ["https://*/*", "http://*/*"],
          })
          if (!granted)
            throw new Error(
              "In chrome://extensions open DevLogin → Details → Site access, and choose “On all sites”."
            )
        }, "DevLogin now works on every website"),
    },
    {
      done: pinned !== false,
      label: "Pin DevLogin: puzzle icon in the toolbar, then the pin",
    },
  ]
  if (steps.every((step) => step.done)) return null
  return (
    <section
      aria-label="Finish setup"
      className="space-y-2 border-b bg-amber-500/5 px-4 py-3"
    >
      <p className="text-sm font-medium">Finish setup</p>
      {steps.map((step) => (
        <div
          key={step.label}
          className="flex items-center justify-between gap-2 text-xs"
        >
          <span
            className={step.done ? "text-muted-foreground line-through" : ""}
          >
            {step.done ? "✓ " : "○ "}
            {step.label}
          </span>
          {!step.done && step.run && (
            <Button size="sm" disabled={busy} onClick={() => void step.run()}>
              {step.action}
            </Button>
          )}
        </div>
      ))}
    </section>
  )
}
