import { browser } from "wxt/browser"

export async function openCenteredWindow(
  url: URL,
  width: number,
  height: number,
  tabId?: number
) {
  const parent = await (async () => {
    if (tabId !== undefined) {
      const tab = await browser.tabs.get(tabId).catch(() => undefined)
      if (tab) return browser.windows.get(tab.windowId)
    }
    return browser.windows.getLastFocused({ windowTypes: ["normal"] })
  })().catch(() => undefined)
  const bounds: { width: number; height: number; left?: number; top?: number } =
    { width, height }
  if (
    parent?.width &&
    parent.height &&
    parent.left !== undefined &&
    parent.top !== undefined
  ) {
    bounds.width = Math.min(width, parent.width)
    bounds.height = Math.min(height, parent.height)
    bounds.left = parent.left + Math.round((parent.width - bounds.width) / 2)
    bounds.top = parent.top + Math.round((parent.height - bounds.height) / 2)
  }
  return browser.windows.create({
    url: url.href,
    type: "popup",
    focused: true,
    ...bounds,
  })
}
