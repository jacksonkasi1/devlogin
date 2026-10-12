import { browser } from "wxt/browser"
import type { User } from "@workspace/shared"
import type { Snapshot } from "./messages"
import { send } from "./client"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { Field, Choice } from "@workspace/ui/components/credential-editors"
export function PopupSettings({
  user,
  origin,
  setOrigin,
  theme,
  setTheme,
  busy,
  act,
  snapshot,
  permission,
}: {
  user: User | null | undefined
  origin: string
  setOrigin: (value: string) => void
  theme: string
  setTheme: (value: string) => void
  busy: boolean
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
  snapshot: Snapshot | null
  permission: (wide?: boolean) => Promise<void>
}) {
  return (
    <section className="py-4">
      <div className="mb-5">
        <h2 className="text-base font-semibold">Settings</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {user
            ? `${user.name} · ${user.email}`
            : "Connect to your DevLogin backend"}
        </p>
      </div>
      <div className="space-y-4">
        <Field
          name="origin"
          label="Backend origin"
          value={origin}
          onChange={setOrigin}
          placeholder="https://devlogin.example.workers.dev"
        />
        <Button
          disabled={busy}
          variant="outline"
          onClick={() =>
            void act(async () => {
              if (
                !(await browser.permissions.request({
                  origins: [new URL(origin).origin + "/*"],
                }))
              )
                throw new Error("Backend permission was not granted")
              return send({ type: "configure", origin })
            }, "Backend saved. Sign in again.")
          }
        >
          Save backend
        </Button>
        <div className="space-y-2">
          <Label>Website monitoring</Label>
          <p className="text-xs text-muted-foreground">
            Optional browser-wide access.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              snapshot?.monitoring
                ? void act(async () => {
                    await browser.permissions.remove({
                      origins: ["https://*/*", "http://*/*"],
                    })
                    await send({ type: "permissions-changed" })
                  }, "Browser-wide monitoring disabled")
                : void permission(true)
            }
          >
            {snapshot?.monitoring
              ? "Disable browser-wide monitoring"
              : "Enable browser-wide monitoring"}
          </Button>
          {snapshot?.excluded?.map((value) => (
            <div className="flex items-center gap-2 text-xs" key={value}>
              <span>{value}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void act(
                    () =>
                      send({ type: "exclude", origin: value, excluded: false }),
                    "Site included"
                  )
                }
              >
                Remove exclusion
              </Button>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-y py-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="submit-after-fill">Submit after autofill</Label>
            <Switch
              id="submit-after-fill"
              disabled={busy}
              checked={snapshot?.settings.submitAfterFill ?? true}
              onCheckedChange={(enabled) =>
                void act(() =>
                  send({
                    type: "ui-settings",
                    settings: { submitAfterFill: enabled },
                  })
                )
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Submit the form after filling.
          </p>
        </div>
        <Label>Appearance</Label>
        <Choice
          label="Appearance"
          value={theme}
          options={["light", "dark", "system"].map((value) => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
          }))}
          onChange={setTheme}
        />

        {user && (
          <Button
            disabled={busy}
            variant="outline"
            onClick={() =>
              void act(() => send({ type: "logout" }), "Signed out")
            }
          >
            Sign out
          </Button>
        )}
      </div>
    </section>
  )
}
