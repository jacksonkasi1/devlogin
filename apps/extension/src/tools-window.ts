import { browser } from "wxt/browser"
export function openTools(kind: string, tabId?: number, address?: string) {
  const url = new URL(browser.runtime.getURL("/tools.html"))
  url.searchParams.set("kind", kind)
  if (tabId && address && /^https?:\/\//.test(address)) {
    url.searchParams.set("tab", String(tabId))
    url.searchParams.set("origin", new URL(address).origin)
  }
  return browser.windows.create({
    url: url.href,
    type: "popup",
    width: 520,
    height: 690,
  })
}
