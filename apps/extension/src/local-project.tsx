import { useState } from "react"
import type { Snapshot } from "./messages"
import { localAddress } from "./local-identity"
import { matchProject, siteProjects } from "@workspace/shared"
import { send } from "./client"
import { Button } from "@workspace/ui/components/button"
import { Choice } from "@workspace/ui/components/credential-editors"

export function LocalProject({
  snapshot,
  busy,
  act,
}: {
  snapshot: Snapshot | null
  busy: boolean
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
}) {
  const [selected, setSelected] = useState("")
  if (!snapshot || !localAddress(snapshot.tabUrl)) return null
  const projects =
    (snapshot.data ? siteProjects(snapshot.data, snapshot.tabUrl) : []).filter(
      (project) => matchProject([project], snapshot.tabUrl)
    ) ?? []
  if (!projects.length) return null
  const value = projects.some((project) => project.id === selected)
    ? selected
    : (snapshot.matchedProjectId ?? projects[0]!.id)
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
      <p className="text-sm font-medium">Local project identity</p>
      <p className="text-xs text-muted-foreground">
        Reusing this port? Identify the running project using its page title or
        app metadata. Filling pauses when the identity changes. Use distinct
        application-name meta tags for apps with identical titles.
      </p>
      <Choice
        label="Local project"
        value={value}
        onChange={setSelected}
        options={projects.map((project) => ({
          value: project.id,
          label: project.name,
        }))}
      />
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          void act(
            () => send({ type: "identify-local", projectId: value }),
            "Local project identity saved"
          )
        }
      >
        Identify this local project
      </Button>
    </div>
  )
}
