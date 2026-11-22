import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { browser } from "wxt/browser"
import {
  ArrowRight,
  Check,
  Circle,
  Globe,
  KeyRound,
  Plus,
} from "@workspace/ui/components/devlogin-icons"
import { Button } from "@workspace/ui/components/button"
import { VaultMark } from "@workspace/ui/components/vault"
import { send } from "../../src/client"
import type { Snapshot } from "../../src/messages"
import { useSetupSteps } from "../../src/setup-checklist"
import { useExtensionTheme } from "../../src/extension-theme"

const tutorialKey = "setupTutorial"
const example = {
  username: "developer@example.test",
  password: "sample-password",
}

type TutorialResult = "complete" | "skipped"
type Stage = "welcome" | "setup" | "save" | "fill" | "complete"

function SetupItem({
  label,
  done,
  children,
}: {
  label: string
  done: boolean
  children?: ReactNode
}) {
  return (
    <li className="setup-item" data-complete={done}>
      {done ? (
        <Check size={17} aria-hidden="true" />
      ) : (
        <Circle size={17} aria-hidden="true" />
      )}
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{label}</h2>
        {done && <span className="sr-only">Complete</span>}
        {children && (
          <div className="mt-2 space-y-3 text-sm text-muted-foreground">
            {children}
          </div>
        )}
      </div>
    </li>
  )
}

export function App() {
  const [stage, setStage] = useState<Stage>(
    location.hash === "#setup" ? "setup" : "welcome"
  )
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [tutorial, setTutorial] = useState<TutorialResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const heading = useRef<HTMLHeadingElement>(null)
  useExtensionTheme(snapshot?.settings.theme)
  const refresh = useCallback(async () => {
    try {
      const [next, stored] = await Promise.all([
        send<Snapshot>({ type: "snapshot" }),
        browser.storage.local.get(tutorialKey),
      ])
      setSnapshot(next)
      setTutorial(
        stored[tutorialKey] === "complete" || stored[tutorialKey] === "skipped"
          ? stored[tutorialKey]
          : null
      )
      setError("")
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not load setup."
      )
    }
  }, [])
  useEffect(() => {
    void refresh()
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [refresh])
  useEffect(() => {
    if (stage !== "welcome" && location.hash !== "#setup") {
      history.replaceState(null, "", "#setup")
    }
    heading.current?.focus()
  }, [stage])
  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try {
      await action()
      await refresh()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Setup could not be updated."
      )
    } finally {
      setBusy(false)
    }
  }
  async function finishTutorial(result: TutorialResult) {
    setBusy(true)
    setError("")
    try {
      await browser.storage.local.set({ [tutorialKey]: result })
      setTutorial(result)
      setStage("setup")
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save tutorial progress."
      )
    } finally {
      setBusy(false)
    }
  }
  const [signIn, access, pin] = useSetupSteps(snapshot, act)
  const message = error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )

  return (
    <main className="welcome-page">
      <header className="welcome-brand">
        <VaultMark /> Global Login
      </header>
      {stage === "welcome" ? (
        <section className="welcome-hero">
          <div className="welcome-intro">
            <h1 ref={heading} tabIndex={-1}>
              Welcome to Global Login
            </h1>
            <p>
              Set up your browser extension to save and fill your team’s project
              logins.
            </p>
            <Button size="lg" onClick={() => setStage("setup")}>
              Continue <ArrowRight />
            </Button>
          </div>
          <div className="welcome-preview" aria-hidden="true">
            <div className="preview-window">
              <div className="preview-toolbar">
                <VaultMark />
                <span />
                <Plus size={16} />
              </div>
              <div className="preview-content">
                <span className="preview-icon">
                  <Globe size={25} />
                </span>
                <strong>Demo workspace</strong>
                <div className="preview-field">
                  <KeyRound size={17} /> <span>••••••••••••</span>{" "}
                  <Check size={16} />
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="welcome-card">
          <h1 ref={heading} tabIndex={-1}>
            {stage === "setup"
              ? "Set up Global Login"
              : "Practice saving and filling a login"}
          </h1>
          {message}
          {stage === "setup" ? (
            <>
              <ol className="setup-list">
                <SetupItem label={signIn.label} done={signIn.done}>
                  {signIn.done ? (
                    !snapshot?.user?.approved && (
                      <p>
                        Ask your administrator to approve your account for
                        shared logins.
                      </p>
                    )
                  ) : (
                    <>
                      <p>
                        Use your team account to access shared project logins.
                      </p>
                      <Button
                        disabled={busy || !snapshot}
                        onClick={() => void signIn.run?.()}
                      >
                        {signIn.action}
                      </Button>
                      {!snapshot && error && (
                        <Button variant="ghost" onClick={() => void refresh()}>
                          Retry
                        </Button>
                      )}
                    </>
                  )}
                </SetupItem>
                <SetupItem label={access.label} done={access.done}>
                  {!access.done && (
                    <>
                      <p>
                        Site access lets Global Login offer to save and fill logins
                        on the websites you visit.
                      </p>
                      <Button
                        variant="outline"
                        disabled={busy || !snapshot}
                        onClick={() => void access.run?.()}
                      >
                        {access.action}
                      </Button>
                    </>
                  )}
                </SetupItem>
                <SetupItem label="Try a sample login" done={tutorial !== null}>
                  {tutorial ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStage("save")}
                    >
                      Repeat tutorial
                    </Button>
                  ) : (
                    <>
                      <p>
                        Practice with a sample username and password. The sample
                        stays on this page.
                      </p>
                      <div className="welcome-actions">
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void finishTutorial("skipped")}
                        >
                          Skip tutorial
                        </Button>
                        <Button onClick={() => setStage("save")}>
                          Start practice tutorial
                        </Button>
                      </div>
                    </>
                  )}
                </SetupItem>
                <SetupItem label={pin.label} done={pin.done}>
                  {!pin.done && (
                    <p>
                      Open your browser’s Extensions menu and select the pin
                      next to Global Login.
                    </p>
                  )}
                </SetupItem>
              </ol>
              {snapshot?.user && (
                <div className="welcome-actions">
                  <Button variant="ghost" onClick={() => window.close()}>
                    Done
                  </Button>
                  <Button
                    render={
                      <a
                        href={snapshot.origin}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    Open dashboard <ArrowRight />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {stage === "save"
                  ? "When you sign in on a website, Global Login can offer to save the login. Try saving this sample."
                  : stage === "fill"
                    ? "When you return to the site, select the saved login to fill the form."
                    : "The sample login filled both fields."}
              </p>
              <div className="practice-fields" aria-label="Sample login">
                <label>
                  Username{" "}
                  <input
                    readOnly
                    value={stage === "fill" ? "" : example.username}
                    placeholder="Username"
                  />
                </label>
                <label>
                  Password{" "}
                  <input
                    readOnly
                    type="password"
                    value={stage === "fill" ? "" : example.password}
                    placeholder="Password"
                  />
                </label>
              </div>
              <div className="welcome-actions">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setStage("setup")}
                >
                  Back to setup
                </Button>
                {stage === "save" && (
                  <Button onClick={() => setStage("fill")}>
                    Save sample login
                  </Button>
                )}
                {stage === "fill" && (
                  <Button onClick={() => setStage("complete")}>
                    Fill sample login
                  </Button>
                )}
                {stage === "complete" && (
                  <Button
                    disabled={busy}
                    onClick={() => void finishTutorial("complete")}
                  >
                    Finish tutorial
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  )
}
