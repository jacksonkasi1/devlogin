import { createRoot } from "react-dom/client"
import { browser } from "wxt/browser"
import { personalKinds, type PersonalKind } from "@workspace/shared"
import { VaultTools } from "@workspace/ui/components/private-vault"
import { Toaster } from "@workspace/ui/components/sonner"
import "@workspace/ui/globals.css"
import { send } from "../../src/client"
import { useExtensionTheme } from "../../src/extension-theme"
const params = new URLSearchParams(location.search)
const tab = Number(params.get("tab"))
const origin = params.get("origin")
const kind = params.get("kind") as PersonalKind
const request = <T,>(path: string, method = "GET", body?: unknown) =>
  send<T>({ type: "api", path, method, body })
async function profileAction(fields?: Record<string, string>) {
  const result = await browser.tabs.sendMessage(
    tab,
    { type: "profile-fields", origin, fields },
    { frameId: 0 }
  )
  if (!result?.ok) throw new Error(result?.error ?? "This form is unavailable")
  return result.fields as Record<string, string>
}
function App() {
  useExtensionTheme()
  return (
    <>
      <VaultTools
        request={request}
        initial={
          personalKinds.includes(kind)
            ? kind
            : params.get("kind") === "browse"
              ? undefined
              : "generator"
        }
        browseProfiles={params.get("kind") === "choose-profile"}
        site={origin ?? undefined}
        profileAction={origin && tab ? profileAction : undefined}
      />
      <Toaster />
    </>
  )
}
createRoot(document.getElementById("root")!).render(<App />)
