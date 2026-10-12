import { accountTone } from "./account-tone"
import { accountWebsites } from "@workspace/shared"
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ItemIcon } from "@workspace/ui/components/login-icon"
import type { PageContext, Pending, Fill } from "./messages"
import { send } from "./client"
import type { UiSettings } from "./ui-settings"
import themeCss from "./inline-theme.css?inline"

const css = `
:host [hidden] { display:none !important; }
:host { all: initial; color-scheme: light dark; }
* { box-sizing: border-box; }
.surface { position: fixed; z-index: 2147483647; font: 13px/1.45 Inter, system-ui, sans-serif; color: light-dark(#171717,#fafafa); background:light-dark(#fff,#202020); border:1px solid light-dark(#dedede,#444); border-radius:14px; box-shadow:0 6px 24px #0002; padding:14px; }
button,input,select { font:inherit; color:inherit; } button { cursor:pointer; border:1px solid light-dark(#dedede,#555); background:transparent; border-radius:8px; padding:8px 10px; } button:hover {background:light-dark(#f4f4f5,#303030)} button:disabled {opacity:.6;cursor:wait} button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid #2563eb; outline-offset:2px; }
.primary {background:light-dark(#171717,#fafafa);color:light-dark(#fff,#171717);border-color:transparent}.primary:hover {opacity:.9;background:light-dark(#171717,#fafafa)}
.dropdown {background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:10px;box-shadow:0 5px 16px #0004;padding:4px;overflow:auto;max-height:300px;font-size:13px}
.dropdown .account-row {display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:6px;padding:9px 10px;text-align:left;cursor:pointer;transition:background-color 150ms,color 150ms}
.dropdown .account-row:is(:hover,:focus-visible),.dropdown .manage:is(:hover,:focus-visible) {background:var(--accent);color:var(--accent-foreground);outline:none}
.login-icon {flex-shrink:0}.login-icon > span {position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:6px;background:light-dark(hsl(var(--tone) 75% 93%),hsl(var(--tone) 30% 23%));color:light-dark(hsl(var(--tone) 65% 32%),hsl(var(--tone) 65% 78%));font-size:18px}.login-icon svg {width:16px;height:16px}.login-icon img {position:absolute;width:20px;height:20px;object-fit:contain;background:inherit}
.account-text {min-width:0}.account-label,.account-email {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-label {font-weight:500}.account-email {font-size:12px;color:var(--muted-foreground)}
.dropdown-footer {display:flex;justify-content:flex-end;padding:2px 4px}.dropdown .manage {display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:4px;border:0;border-radius:5px;cursor:pointer;transition:background-color 150ms,color 150ms}
.muted {color:light-dark(#666,#aaa);font-size:12px}.prompt {width:320px;right:16px;top:16px}.prompt h2{font-size:16px;margin:0 0 8px}.prompt p{margin:6px 0;overflow-wrap:anywhere}.prompt label {display:block;margin-top:10px}.prompt input,.prompt select {display:block;width:100%;margin:5px 0;padding:8px;background:transparent;border:1px solid light-dark(#ddd,#555);border-radius:8px}.actions{display:flex;gap:8px;margin-top:14px}.actions button{flex:1}.error{color:light-dark(#b91c1c,#fca5a5)}
.prompt {width:360px;max-width:calc(100vw - 24px);max-height:calc(100vh - 32px);overflow:auto;background:var(--popover);color:var(--popover-foreground);border-color:var(--border);border-radius:10px;padding:16px;box-shadow:0 8px 30px #0003}
.prompt-header {display:flex;align-items:center;gap:9px;margin-bottom:16px}.prompt-header h2 {flex:1;font-size:15px;font-weight:600;margin:0}.brand-icon {color:var(--primary)}.prompt .close {border:0;padding:0;width:24px;height:24px;font-size:22px;color:var(--muted-foreground)}
.segments {display:flex;padding:3px;background:var(--muted);border-radius:7px;gap:3px;margin-bottom:14px}.segments button {flex:1;border:0;padding:6px;font-size:12px;border-radius:5px}.segments button[aria-selected=true] {background:var(--background);box-shadow:0 1px 3px #0002}
.login-summary {display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:7px;padding:12px}.login-summary .account-text {flex:1}.login-icon {display:flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;background:var(--muted);border:1px solid var(--border);border-radius:6px}.prompt .edit {padding:4px 8px;font-size:12px}
.preview-fields {padding:8px 0}.prompt input,.prompt select {border-color:var(--border);border-radius:6px;background:var(--background);color:var(--foreground)}.prompt select option {background:var(--background);color:var(--foreground)}
.prompt .update-row {display:flex;align-items:center;gap:10px;margin:0;padding:10px;border-radius:6px;cursor:pointer;transition:background 150ms}.update-row .account-text {flex:1}.prompt .update-row input {width:15px;margin:0;padding:0;accent-color:var(--primary)}.update-row:hover,.update-row.selected {background:var(--accent)}.update-list {max-height:210px;overflow:auto}.prompt .detection-note {font-size:11px;margin-top:12px}.prompt .actions {justify-content:flex-end;border-top:1px solid var(--border);padding-top:12px}.prompt .actions button {flex:initial;min-width:80px;border-radius:6px;padding:7px 12px}.prompt .primary {background:var(--primary);color:var(--primary-foreground)}
`
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = ""
) {
  const result = document.createElement(tag)
  result.textContent = text
  if (cls) result.className = cls
  return result
}
export function inpage(
  fill: (instruction: Fill) => Promise<unknown>,
  refresh: () => Promise<void>
) {
  const host = document.createElement("devlogin-ui")
  const shadow = host.attachShadow({ mode: "open" })
  const style = node("style", css)
  // Production CSS is minified to :root{...}; map the selector itself so the
  // light palette is defined inside the shadow root in either build format.
  shadow.append(node("style", themeCss.replace(/:root\b/g, ":host")), style)
  document.documentElement.append(host)
  let settings: UiSettings = { theme: "system", submitAfterFill: true }
  const media = matchMedia("(prefers-color-scheme: dark)")
  const applyTheme = () => {
    const dark =
      settings.theme === "dark" ||
      (settings.theme === "system" && media.matches)
    host.style.colorScheme = dark ? "dark" : "light"
    for (const surface of shadow.querySelectorAll(".surface"))
      surface.classList.toggle("dark", dark)
  }
  function setSettings(next: UiSettings) {
    settings = next
    applyTheme()
  }
  media.addEventListener("change", applyTheme)
  applyTheme()
  const activate = new Map<HTMLButtonElement, () => Promise<void>>()
  let anchor: HTMLInputElement | null = null
  let suggestion: HTMLElement | null = null
  let prompt: HTMLElement | null = null
  let promptId = ""
  let expiry: ReturnType<typeof setTimeout> | undefined
  const iconRoots: Root[] = []
  function closeSuggestions() {
    for (const root of iconRoots) root.unmount()
    iconRoots.length = 0
    suggestion?.remove()
    suggestion = null
    activate.clear()
  }
  let suppressFocus = false
  function position(element: HTMLElement) {
    if (!anchor?.isConnected) {
      closeSuggestions()
      return
    }
    const rect = anchor.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > innerHeight) {
      closeSuggestions()
      return
    }
    const width = Math.min(340, Math.max(300, rect.width), innerWidth - 16)
    element.style.width = `${Math.max(0, width)}px`
    element.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`
    element.style.top = `${rect.bottom + 4}px`
    element.style.maxHeight = `${Math.max(0, Math.min(300, innerHeight - rect.bottom - 12))}px`
  }
  function suggest(input: HTMLInputElement, context: PageContext) {
    if (suppressFocus && input === anchor) {
      suppressFocus = false
      return
    }
    closeSuggestions()
    if (!context.project || !context.accounts.length) return
    setSettings(context.settings)
    anchor = input
    const menu = node("div", "", "surface dropdown")
    menu.setAttribute("role", "region")
    menu.setAttribute("aria-label", "Global Login accounts")
    // Keep the original input focused during pointer selection. Keyboard users
    // can still move into the rows with ArrowDown or Tab.
    menu.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest("button"))
        event.preventDefault()
    })
    for (const account of context.accounts) {
      const button = node(
        "button",
        "",
        "account-row hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground transition-colors duration-150"
      )
      // Use the same icon shape, with restrained colors for recognizable roles.
      button.style.setProperty("--tone", String(accountTone(account).hue))
      button.type = "button"
      button.setAttribute("aria-label", `${account.label} · ${account.email}`)
      const icon = node("span", "", "login-icon")
      icon.setAttribute("aria-hidden", "true")
      const root = createRoot(icon)
      iconRoots.push(root)
      root.render(
        createElement(ItemIcon, {
          icon: account.icon,
          website: accountWebsites(account, context.project)[0]?.url,
        })
      )
      const text = node("span", "", "account-text")
      text.append(
        node("span", account.label, "account-label"),
        node("span", account.email, "account-email")
      )
      button.append(icon, text)
      const select = async () => {
        if (button.disabled) return
        button.disabled = true
        try {
          await fill(
            await send<Fill>({ type: "suggest-fill", accountId: account.id })
          )
          closeSuggestions()
        } catch (error) {
          button.title =
            error instanceof Error ? error.message : "Could not fill"
          button.disabled = false
        }
      }
      activate.set(button, select)
      button.onclick = (event) => {
        if (event.isTrusted) void select()
      }
      menu.append(button)
    }
    const footer = node("div", "", "dropdown-footer")
    const manage = node(
      "button",
      "",
      "manage hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent transition-colors duration-150"
    )
    manage.type = "button"
    manage.title = "Manage Accounts"
    manage.setAttribute("aria-label", "Manage Accounts")
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("viewBox", "0 0 24 24")
    svg.setAttribute("width", "16")
    svg.setAttribute("height", "16")
    svg.setAttribute("fill", "none")
    svg.setAttribute("stroke", "currentColor")
    svg.setAttribute("stroke-width", "1.5")
    svg.setAttribute("aria-hidden", "true")
    for (const d of [
      "M4 7h7m4 0h5M4 17h3m4 0h9",
      "M15 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
      "M11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
    ]) {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      )
      path.setAttribute("d", d)
      svg.append(path)
    }
    manage.append(svg)
    manage.onclick = (event) => {
      if (!event.isTrusted) return
      void send({ type: "manage" }).catch(() => {})
      closeSuggestions()
    }
    footer.append(manage)
    menu.append(footer)
    shadow.append(menu)
    suggestion = menu
    applyTheme()
    position(menu)
  }
  function showPending(pending: Pending) {
    if (pending.id === promptId) return
    prompt?.remove()
    clearTimeout(expiry)
    promptId = pending.id
    const box = node("section", "", "surface prompt")
    prompt = box
    box.setAttribute("role", "dialog")
    box.setAttribute(
      "aria-label",
      pending.matches.length
        ? "Update password in Global Login?"
        : "Save login to Global Login?"
    )
    let mode: "new" | "update" = pending.matches.length ? "update" : "new"
    const header = node("div", "", "prompt-header")
    const mark = node("span", "", "brand-icon")
    mark.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 7h.01M9 13a6 6 0 1 1 4 4l-3 3H7v-3H4v-3l5-1Z"/></svg>'
    const heading = node(
      "h2",
      mode === "update" ? "Update saved login?" : "Save login?"
    )
    const x = node("button", "×", "close")
    x.setAttribute("aria-label", "Close")
    header.append(mark, heading, x)
    box.append(header)
    const tabs = node("div", "", "segments")
    tabs.setAttribute("role", "tablist")
    const newTab = node("button", "New Login")
    const updateTab = node("button", "Update Existing")
    newTab.setAttribute("role", "tab")
    updateTab.setAttribute("role", "tab")
    updateTab.disabled = !pending.matches.length
    tabs.append(newTab, updateTab)
    box.append(tabs)
    const summary = node("div", "", "login-summary")
    const icon = node(
      "span",
      pending.project?.icon && !/^[a-z]+$/.test(pending.project.icon)
        ? pending.project.icon
        : "🔑",
      "login-icon"
    )
    const identity = node("div", "", "account-text")
    const title = pending.project?.name ?? new URL(pending.website).hostname
    const titleText = node("span", title, "account-label")
    identity.append(titleText, node("span", pending.email, "account-email"))
    const edit = node("button", "Edit", "edit")
    summary.append(icon, identity, edit)
    const label = node("input")
    label.value = title
    label.setAttribute("aria-label", "Account label")
    label.hidden = true
    edit.onclick = () => {
      label.hidden = !label.hidden
      if (!label.hidden) label.focus()
    }
    label.oninput = () => {
      titleText.textContent = label.value || title
    }
    const newFields = node("div")
    newFields.append(summary, label)
    const fields = node("div", "", "preview-fields")
    fields.append(
      node("p", "Password  ••••••••••••"),
      node("p", new URL(pending.website).host, "muted")
    )
    newFields.append(fields)
    const projectChoice = node("select")
    projectChoice.setAttribute("aria-label", "Project")
    const newProject = node("option", "Create new project")
    newProject.value = ""
    projectChoice.append(newProject)
    for (const project of pending.projects ?? []) {
      const option = node(
        "option",
        `${project.icon ?? ""} ${project.name}`.trim()
      )
      option.value = project.id
      projectChoice.append(option)
    }
    projectChoice.value = pending.project?.id ?? ""
    const projectName = node("input")
    projectName.value = new URL(pending.website).host
    projectName.setAttribute("aria-label", "Project name")
    projectName.hidden = !!projectChoice.value
    projectChoice.onchange = () => {
      projectName.hidden = !!projectChoice.value
    }
    newFields.append(
      node("label", "Save to", "muted"),
      projectChoice,
      projectName
    )
    const updateFields = node("div", "", "update-list")
    let accountId = pending.matches[0]?.id
    for (const account of pending.matches) {
      const row = node("label", "", "update-row")
      const radio = node("input")
      radio.type = "radio"
      radio.name = "devlogin-update"
      radio.value = account.id
      radio.checked = account.id === accountId
      radio.setAttribute("aria-label", `${account.label} · ${account.email}`)
      const text = node("span", "", "account-text")
      text.append(
        node("span", account.label, "account-label"),
        node("span", account.email, "account-email")
      )
      row.append(
        node(
          "span",
          account.icon && !/^[a-z]+$/.test(account.icon) ? account.icon : "🔑",
          "login-icon"
        ),
        text,
        radio
      )
      row.classList.toggle("selected", radio.checked)
      radio.onchange = () => {
        accountId = account.id
        for (const other of updateFields.querySelectorAll(".update-row"))
          other.classList.remove("selected")
        row.classList.add("selected")
      }
      updateFields.append(row)
    }
    box.append(newFields, updateFields)
    box.append(
      node("p", "Form submitted · Sign-in not verified", "muted detection-note")
    )
    const error = node("p", "", "error")
    error.setAttribute("role", "alert")
    box.append(error)
    const actions = node("div", "", "actions")
    const save = node("button", "", "primary")
    const dismiss = node("button", "Not now")
    function close() {
      box.remove()
      if (prompt === box) prompt = null
      clearTimeout(expiry)
    }
    const dismissPrompt = () => {
      void send({ type: "dismiss", id: pending.id }).catch(() => {})
      close()
    }
    x.onclick = dismissPrompt
    dismiss.onclick = dismissPrompt
    function renderMode() {
      newFields.hidden = mode !== "new"
      updateFields.hidden = mode !== "update"
      newTab.setAttribute("aria-selected", String(mode === "new"))
      updateTab.setAttribute("aria-selected", String(mode === "update"))
      heading.textContent =
        mode === "new" ? "Save login?" : "Update saved login?"
      save.textContent = mode === "new" ? "Save login" : "Update saved"
    }
    newTab.onclick = () => {
      mode = "new"
      renderMode()
    }
    updateTab.onclick = () => {
      mode = "update"
      renderMode()
    }
    renderMode()
    save.onclick = async (event) => {
      // Only a real user action can save or overwrite shared credentials.
      if (!event.isTrusted) return
      save.disabled = true
      dismiss.disabled = true
      x.disabled = true
      newTab.disabled = true
      updateTab.disabled = true
      try {
        await send({
          type: "confirm",
          id: pending.id,
          mode,
          accountId: mode === "update" ? accountId : undefined,
          label: label.value,
          projectName: projectName.value,
          projectId:
            mode === "update"
              ? pending.project?.id
              : projectChoice.value || null,
        })
        await refresh()
        box.replaceChildren(
          node("h2", mode === "update" ? "Password updated" : "Login saved"),
          node("p", "Synced with Global Login", "muted")
        )
        expiry = setTimeout(close, 2000)
      } catch (failure) {
        error.textContent =
          failure instanceof Error ? failure.message : "Could not save"
        save.disabled = false
        dismiss.disabled = false
        x.disabled = false
        newTab.disabled = false
        updateTab.disabled = !pending.matches.length
      }
    }
    actions.append(dismiss, save)
    box.append(actions)
    shadow.append(box)
    applyTheme()
    expiry = setTimeout(close, Math.max(1, pending.expires - Date.now()))
  }
  const outside = (event: Event) => {
    if (!event.composedPath().includes(host)) closeSuggestions()
  }
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      const restore = suggestion && shadow.activeElement instanceof HTMLElement
      closeSuggestions()
      if (restore && anchor?.isConnected) {
        suppressFocus = true
        anchor.focus()
      }
      prompt
        ?.querySelector<HTMLButtonElement>(".actions button:first-child")
        ?.click()
    }
  }
  const keyboard = (event: KeyboardEvent) => {
    if (
      !suggestion ||
      !event.isTrusted ||
      !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
    )
      return
    if (event.target !== anchor && !event.composedPath().includes(host)) return
    if (event.key === "Enter") {
      if (event.target === anchor && !event.isComposing) {
        const row = suggestion.querySelector<HTMLButtonElement>(
          ".account-row:not(:disabled)"
        )
        if (row) {
          event.preventDefault()
          void activate.get(row)?.()
        }
      }
      return
    }
    const buttons = [
      ...suggestion.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)"
      ),
    ]
    if (!buttons.length) return
    event.preventDefault()
    const index = buttons.indexOf(shadow.activeElement as HTMLButtonElement)
    const next =
      index < 0
        ? event.key === "ArrowDown"
          ? 0
          : buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length
    buttons[next]?.focus()
  }
  const reposition = () => {
    if (suggestion) position(suggestion)
  }
  document.addEventListener("pointerdown", outside, true)
  document.addEventListener("keydown", escape, true)
  document.addEventListener("keydown", keyboard, true)
  document.addEventListener("scroll", reposition, true)
  window.addEventListener("resize", reposition)
  return {
    suggest,
    setSettings,
    showPending,
    closeSuggestions,
    destroy() {
      media.removeEventListener("change", applyTheme)
      host.remove()
      clearTimeout(expiry)
      document.removeEventListener("pointerdown", outside, true)
      document.removeEventListener("keydown", escape, true)
      document.removeEventListener("keydown", keyboard, true)
      document.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    },
  }
}
