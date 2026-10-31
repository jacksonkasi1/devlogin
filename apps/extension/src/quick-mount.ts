// Injected with scripting.executeScript, so it must not reference outer scope.
// The extension page lives in a closed shadow root and a cross-origin iframe:
// the website can read neither the one-time token nor the vault contents.
export function mountQuickAccess(src: string, token: string) {
  // Content-script globals live in the extension's isolated world, not the page's.
  const scope = globalThis as { globalLoginQuickClose?: () => void }
  if (scope.globalLoginQuickClose) {
    scope.globalLoginQuickClose()
    return
  }
  const previous =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  const host = document.createElement("div")
  // Top layer: above any z-index the page uses. The page cannot restyle it unnoticed.
  host.setAttribute("popover", "manual")
  host.style.cssText = [
    "position:fixed",
    "inset:0",
    "width:100%",
    "height:100%",
    "max-width:none",
    "max-height:none",
    "margin:0",
    "padding:0",
    "border:0",
    "background:transparent",
    "overflow:visible",
    "opacity:1",
    "display:block",
    "visibility:visible",
  ]
    .map((rule) => `${rule} !important`)
    .join(";")
  const shadow = host.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  // No transforms or opacity on the frame: it tracks its own visibility (IntersectionObserver v2).
  style.textContent = `
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.28); animation: fade 120ms ease-out; }
    iframe { position: fixed; inset-inline: 0; margin-inline: auto; top: 12vh;
      width: min(720px, calc(100vw - 32px)); height: min(480px, 84vh);
      border: 0; border-radius: 14px; background: transparent; color-scheme: normal;
      box-shadow: 0 24px 80px rgba(0,0,0,.35), 0 0 0 1px rgba(127,127,127,.25); }
    @keyframes fade { from { opacity: 0 } }
    @media (prefers-reduced-motion: reduce) { .backdrop { animation: none } }
  `
  const backdrop = document.createElement("div")
  backdrop.className = "backdrop"
  const frame = document.createElement("iframe")
  frame.src = src
  frame.allow = "clipboard-write"
  frame.title = "Global Login Quick Access"
  const watcher = new MutationObserver((records) => {
    if (
      !host.isConnected ||
      records.some((record) => record.type === "attributes")
    )
      close()
  })
  function close() {
    watcher.disconnect()
    delete scope.globalLoginQuickClose
    host.remove()
    window.removeEventListener("message", message, true)
    document.removeEventListener("keydown", key, true)
    if (previous?.isConnected) previous.focus({ preventScroll: true })
  }
  function message(event: MessageEvent) {
    if (
      event.source === frame.contentWindow &&
      (event.data as { type?: string } | null)?.type ===
        "global-login-quick-close"
    )
      close()
  }
  function key(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation()
      close()
    }
  }
  backdrop.addEventListener("click", close)
  frame.addEventListener("load", () => {
    // Deliver the token only to the extension origin; a navigated frame never receives it.
    frame.contentWindow?.postMessage(
      { type: "global-login-quick-token", token },
      new URL(src).origin
    )
    frame.focus()
  })
  window.addEventListener("message", message, true)
  document.addEventListener("keydown", key, true)
  shadow.append(style, backdrop, frame)
  document.documentElement.append(host)
  try {
    host.showPopover()
  } catch {
    /* Older browsers fall back to fixed positioning. */
  }
  scope.globalLoginQuickClose = close
  // Any attempt by the page to restyle, hide or detach the overlay closes it.
  watcher.observe(host, { attributes: true })
  watcher.observe(document.documentElement, { childList: true })
  frame.focus()
}
