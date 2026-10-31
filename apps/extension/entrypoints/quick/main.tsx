import { createRoot } from "react-dom/client"
import "@workspace/ui/globals.css"
import "./style.css"
import { QuickAccess } from "../../src/quick-access"
import { send } from "../../src/client"
import type { Snapshot } from "../../src/messages"

const embedded = !new URLSearchParams(location.search).has("window")
const root = createRoot(document.getElementById("root")!)
const redeem = (token: string) =>
  send<Snapshot>({ type: "quick-session", token })
const render = (session: Promise<Snapshot>) =>
  root.render(<QuickAccess session={session} embedded={embedded} />)
// The fallback window gets its token in the URL; framed overlays receive it
// by postMessage from the extension's own content-script world.
if (embedded) {
  // The page shares that window, so it can post forged tokens too: try each
  // one and keep listening until the real token is redeemed.
  let done = false
  const finish = (session: Promise<Snapshot>) => {
    if (done) return
    done = true
    window.removeEventListener("message", receive)
    render(session)
  }
  const receive = (event: MessageEvent) => {
    const data = event.data as { type?: string; token?: unknown } | null
    if (
      event.source !== window.parent ||
      data?.type !== "global-login-quick-token" ||
      typeof data.token !== "string"
    )
      return
    const session = redeem(data.token)
    session.then(
      () => finish(session),
      () => {}
    )
  }
  window.addEventListener("message", receive)
  setTimeout(() => {
    if (!done)
      finish(
        Promise.reject(
          new Error("Quick Access expired. Press the shortcut again.")
        )
      )
  }, 5_000)
} else render(redeem(location.hash.slice(1)))
