import type { ReactNode } from "react"
import {
  accountMatches,
  type Project,
  Preference,
  Sync,
  User,
} from "@workspace/shared"
import type { Snapshot, View } from "./messages"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { Choice } from "@workspace/ui/components/credential-editors"
export function CurrentWebsite({
  detected,
  data,
  user,
  snapshot,
  busy,
  preference,
  act,
  savePreference,
  openProject,
  permission,
  accountList,
  currentOrigin,
  setEditingProject,
  setView,
}: {
  detected: Project | undefined
  data: Sync
  user: User
  snapshot: Snapshot | null
  busy: boolean
  preference: (item: Project) => Preference
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
  savePreference: (
    item: Project,
    update: Partial<Preference>
  ) => Promise<unknown>
  openProject: (item: Project) => void
  permission: (wide?: boolean) => Promise<void>
  accountList: (item: Project) => ReactNode
  currentOrigin: string
  setEditingProject: (item: Project | undefined) => void
  setView: (view: View) => void
}) {
  return detected ? (
    <>
      <Card>
        <CardHeader>
          <p className="text-xs text-muted-foreground">CURRENT WEBSITE</p>
          <CardTitle>
            {detected.name}{" "}
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            >
              Matched
            </Badge>
          </CardTitle>
          <CardDescription className="break-all">
            {snapshot?.tabUrl ? new URL(snapshot.tabUrl).host : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Selected account</Label>
          <Choice
            label="Selected account"
            value={
              preference(detected).account_id ??
              data.accounts.find(
                (account) =>
                  account.project_id === detected.id &&
                  accountMatches(account, snapshot?.tabUrl ?? "")
              )?.id ??
              ""
            }
            options={data.accounts
              .filter(
                (account) =>
                  account.project_id === detected.id &&
                  accountMatches(account, snapshot?.tabUrl ?? "")
              )
              .map((account) => ({
                value: account.id,
                label: `${account.label} · ${account.email}`,
              }))}
            onChange={(id) =>
              void act(() => savePreference(detected, { account_id: id }))
            }
          />
          <div className="flex items-center gap-2">
            <Switch
              id="auto-login"
              checked={preference(detected).auto_login}
              disabled={busy}
              onCheckedChange={(enabled) =>
                void act(() =>
                  savePreference(detected, {
                    auto_login: enabled,
                    account_id:
                      preference(detected).account_id ??
                      data.accounts.find(
                        (account) =>
                          account.project_id === detected.id &&
                          accountMatches(account, snapshot?.tabUrl ?? "")
                      )?.id ??
                      null,
                  })
                )
              }
            />
            <Label htmlFor="auto-login">Auto-login</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Runs on configured websites with the selected account. Repeated
            attempts are paused.
          </p>
          <Button variant="outline" onClick={() => openProject(detected)}>
            Manage / view accounts
          </Button>
        </CardContent>
      </Card>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => void permission()}
      >
        Enable DevLogin on this site
      </Button>
      {accountList(detected)}
    </>
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>No matching project</CardTitle>
        <CardDescription>
          Open a saved login’s website, or add this website to a login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Badge variant="outline">Unregistered</Badge>
        {currentOrigin && (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => void permission()}
          >
            Enable DevLogin on this site
          </Button>
        )}
        {user.is_admin && currentOrigin && (
          <Button
            className="w-full"
            onClick={() => {
              setEditingProject(undefined)
              setView("project-edit")
            }}
          >
            Add Project
          </Button>
        )}
        <Button variant="outline" onClick={() => setView("projects")}>
          View projects
        </Button>
      </CardContent>
    </Card>
  )
}
