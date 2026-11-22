import { configureIconBackend } from "@workspace/shared"
import { useEffect, useState } from "react"
import { browser } from "wxt/browser"
import type { Account } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { AccountEditor } from "@workspace/ui/components/credential-editors"
import { Toaster } from "@workspace/ui/components/sonner"
import { VaultMark } from "@workspace/ui/components/vault"
import { send } from "../../src/client"
import { useExtensionTheme } from "../../src/extension-theme"
import { savedLoginKey, type SavedLogin } from "../../src/login-window"
import type { Snapshot } from "../../src/messages"

const query = new URLSearchParams(location.search)
const accountId = query.get("account")
const projectId = query.get("project")
const tabId = Number(query.get("tab"))

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [website, setWebsite] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  useExtensionTheme(snapshot?.settings.theme)

  useEffect(() => {
    const tab =
      tabId > 0 ? browser.tabs.get(tabId).catch(() => undefined) : undefined
    void Promise.all([send<Snapshot>({ type: "snapshot" }), tab])
      .then(([next, source]) => {
        configureIconBackend(next.origin)
        setSnapshot(next)
        if (
          source?.url?.startsWith("http:") ||
          source?.url?.startsWith("https:")
        ) {
          setWebsite(source.url)
        }
      })
      .catch((failure) =>
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not load the login editor."
        )
      )
  }, [])

  const account = snapshot?.data?.accounts.find((item) => item.id === accountId)
  const projects = snapshot?.data?.projects ?? []
  const project =
    projects.find((item) => item.id === (account?.project_id ?? projectId)) ??
    projects[0]
  const allowed =
    snapshot?.user?.approved &&
    (snapshot.user.is_admin || snapshot.user.can_edit)
  const unavailable =
    snapshot && (!allowed || (accountId && !account) || !project)

  async function save(body: unknown) {
    if (busy) return
    setBusy(true)
    setError("")
    let saved: Account
    try {
      saved = await send<Account>({
        type: "api",
        path: accountId ? `/api/accounts/${accountId}` : "/api/accounts",
        method: accountId ? "PUT" : "POST",
        body,
      })
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not save the login."
      )
      setBusy(false)
      return
    }
    const selection: SavedLogin = { id: saved.id, project_id: saved.project_id }
    await browser.storage.session
      .set({ [savedLoginKey]: selection })
      .catch(() => {})
    window.close()
  }

  return (
    <main className="editor-window">
      <header className="vault-header editor-window-header">
        <VaultMark />
        <h1>{accountId ? "Edit login" : "Add login"}</h1>
      </header>
      {error && (
        <p role="alert" className="editor-window-message text-destructive">
          {error}
        </p>
      )}
      {unavailable ? (
        <div className="editor-window-message space-y-3">
          <p>
            {!allowed
              ? "You need edit access to save shared logins."
              : accountId
                ? "This login is no longer available."
                : "Create a project before adding a login."}
          </p>
          <Button variant="outline" onClick={() => window.close()}>
            Close
          </Button>
        </div>
      ) : project ? (
        <AccountEditor
          account={account}
          projectId={project.id}
          projects={projects}
          website={account ? undefined : website}
          busy={busy}
          onCancel={() => window.close()}
          onSave={(body) => void save(body)}
        />
      ) : error ? (
        <div className="editor-window-message">
          <Button variant="outline" onClick={() => location.reload()}>
            Retry
          </Button>
        </div>
      ) : (
        <p role="status" className="editor-window-message">
          Loading login editor…
        </p>
      )}
      <Toaster theme={snapshot?.settings.theme ?? "system"} />
    </main>
  )
}
