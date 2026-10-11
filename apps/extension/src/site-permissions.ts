import { browser } from "wxt/browser"

export function forbidden(
  address: string,
  backend: string,
  excluded: string[] = []
) {
  const url = new URL(address)
  return (
    !["http:", "https:"].includes(url.protocol) ||
    !(
      url.protocol === "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) ||
    url.origin === backend ||
    excluded.includes(url.origin) ||
    /(^|\.)(google\.com|googleapis\.com|gstatic\.com)$/.test(url.hostname)
  )
}
let registrations = Promise.resolve()
export function registerSites() {
  const next = registrations.catch(() => {}).then(applySites)
  registrations = next
  return next
}
async function applySites() {
  const { origins = [] } = await browser.permissions.getAll()
  const matches = origins.filter((origin) => /^https?:/.test(origin))
  const registered = await browser.scripting.getRegisteredContentScripts()
  if (registered.some((script) => script.id === "devlogin-sites"))
    await browser.scripting.unregisterContentScripts({
      ids: ["devlogin-sites"],
    })
  if (!matches.length) return
  await browser.scripting.registerContentScripts([
    {
      id: "devlogin-sites",
      matches,
      js: ["content-scripts/content.js"],
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: true,
    },
  ])
  // Newly enabled sites should work without asking the user to reload.
  for (const tab of await browser.tabs.query({})) {
    if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) continue
    try {
      if (
        await browser.permissions.contains({
          origins: [new URL(tab.url).origin + "/*"],
        })
      )
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["/content-scripts/content.js"],
        })
    } catch {
      /* A tab may close or be restricted by Chrome. */
    }
  }
}
