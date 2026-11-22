import { useEffect, useState } from "react"
import { browser } from "wxt/browser"
import type { Snapshot } from "./messages"
import { send } from "./client"
import { Button } from "@workspace/ui/components/button"

export type Step = {
  done: boolean
  label: string
  action?: string
  run?: () => Promise<void>
}

export function openSetup() {
  return browser.tabs.create({
    url: browser.runtime.getURL("/welcome.html#setup"),
  })
}

export function useSetupSteps(
  snapshot: Snapshot | null,
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
): Step[] {
  const [pinned, setPinned] = useState<boolean | null>(null)
  useEffect(() => {
    const update = () => {
      void browser.action
        .getUserSettings?.()
        .then((settings) => setPinned(settings.isOnToolbar))
        .catch(() => setPinned(null))
    }
    update()
    window.addEventListener("focus", update)
    browser.action.onUserSettingsChanged?.addListener(update)
    return () => {
      window.removeEventListener("focus", update)
      browser.action.onUserSettingsChanged?.removeListener(update)
    }
  }, [])
  return [
    {
      done: !!snapshot?.user,
      label: "Sign in with Google",
      action: "Continue with Google",
      run: () => act(() => send({ type: "login" })),
    },
    {
      done: !!snapshot?.monitoring,
      label: "Allow Global Login on all websites",
      action: "Allow access",
      run: () =>
        act(async () => {
          const granted = await browser.permissions.request({
            origins: ["https://*/*", "http://*/*"],
          })
          if (!granted)
            throw new Error(
              "Open Global Login’s extension details and set Site access to On all sites."
            )
        }),
    },
    {
      done: pinned !== false,
      label: "Pin Global Login to your toolbar",
    },
  ]
}

export function SetupChecklist({
  snapshot,
  busy,
  act,
}: {
  snapshot: Snapshot | null
  busy: boolean
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
}) {
  const steps = useSetupSteps(snapshot, act)
  if (!snapshot || steps.every((step) => step.done)) return null
  return (
    <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
      <span className="text-xs text-muted-foreground">
        Extension setup is incomplete.
      </span>
      <Button
        variant="ghost"
        size="xs"
        disabled={busy}
        onClick={() => void openSetup()}
      >
        Finish setup
      </Button>
    </div>
  )
}
