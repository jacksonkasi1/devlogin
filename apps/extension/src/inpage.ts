import { accountTone } from "./account-tone"
import type { PageContext, Pending, Fill } from "./messages"
import { send } from "./client"
import type { UiSettings } from "./ui-settings"
import themeCss from "./inline-theme.css?inline"

const css = `
:host { all: initial; color-scheme: light dark; }
* { box-sizing: border-box; }
.surface { position: fixed; z-index: 2147483647; font: 13px/1.45 Inter, system-ui, sans-serif; color: light-dark(#171717,#fafafa); background:light-dark(#fff,#202020); border:1px solid light-dark(#dedede,#444); border-radius:14px; box-shadow:0 6px 24px #0002; padding:14px; }
button,input,select { font:inherit; color:inherit; } button { cursor:pointer; border:1px solid light-dark(#dedede,#555); background:transparent; border-radius:8px; padding:8px 10px; } button:hover {background:light-dark(#f4f4f5,#303030)} button:disabled {opacity:.6;cursor:wait} button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid #2563eb; outline-offset:2px; }
.primary {background:light-dark(#171717,#fafafa);color:light-dark(#fff,#171717);border-color:transparent}.primary:hover {opacity:.9;background:light-dark(#171717,#fafafa)}
.dropdown {background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:10px;box-shadow:0 5px 16px #0004;padding:4px;overflow:auto;max-height:300px;font-size:13px}
.dropdown .account-row {display:flex;align-items:center;gap:10px;width:100%;border:0;border-radius:6px;padding:9px 10px;text-align:left;cursor:pointer;transition:background-color 150ms,color 150ms}
.dropdown .account-row:is(:hover,:focus-visible),.dropdown .manage:is(:hover,:focus-visible) {background:var(--accent);color:var(--accent-foreground);outline:none}
.project-initials {display:flex;align-items:center;justify-content:center;flex-shrink:0;width:30px;height:30px;border-radius:6px;background:light-dark(hsl(var(--tone) 75% 93%),hsl(var(--tone) 30% 23%));color:light-dark(hsl(var(--tone) 65% 32%),hsl(var(--tone) 65% 78%));font-size:11px;font-weight:600}
.account-text {min-width:0}.account-label,.account-email {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-label {font-weight:500}.account-email {font-size:12px;color:var(--muted-foreground)}
.dropdown-footer {display:flex;justify-content:flex-end;padding:2px 4px}.dropdown .manage {display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:4px;border:0;border-radius:5px;cursor:pointer;transition:background-color 150ms,color 150ms}
.muted {color:light-dark(#666,#aaa);font-size:12px}.prompt {width:320px;right:16px;top:16px}.prompt h2{font-size:16px;margin:0 0 8px}.prompt p{margin:6px 0;overflow-wrap:anywhere}.prompt label {display:block;margin-top:10px}.prompt input,.prompt select {display:block;width:100%;margin:5px 0;padding:8px;background:transparent;border:1px solid light-dark(#ddd,#555);border-radius:8px}.actions{display:flex;gap:8px;margin-top:14px}.actions button{flex:1}.error{color:light-dark(#b91c1c,#fca5a5)}
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
  shadow.append(node("style", themeCss.replace(":root {", ":host {")), style)
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
  function closeSuggestions() {
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
    menu.setAttribute("aria-label", "DevLogin accounts")
    // Keep the original input focused during pointer selection. Keyboard users
    // can still move into the rows with ArrowDown or Tab.
    menu.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest("button"))
        event.preventDefault()
    })
    const initials = context.project.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase()
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
      const icon = node("span", initials, "project-initials")
      icon.setAttribute("aria-hidden", "true")
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
        ? "Update password in DevLogin?"
        : "Save login to DevLogin?"
    )
    box.append(
      node(
        "h2",
        pending.matches.length
          ? "Update password in DevLogin?"
          : "Save login to DevLogin?"
      )
    )
    box.append(
      node(
        "p",
        `${pending.project?.name ?? "New project"} · ${new URL(pending.website).host}`,
        "muted"
      )
    )
    box.append(
      node(
        "p",
        "Form submission detected. Authentication success has not been verified.",
        "muted"
      )
    )
    const choice = node("select")
    if (pending.matches.length) {
      box.append(node("label", "Account to update"))
      choice.setAttribute("aria-label", "Account to update")
      for (const account of pending.matches) {
        const option = node("option", `${account.label} · ${account.email}`)
        option.value = account.id
        choice.append(option)
      }
      box.append(choice)
    } else box.append(node("p", pending.email))
    box.append(node("p", "Password: ••••••••••••"))
    const label = node("input")
    label.placeholder = "Account label (optional)"
    label.setAttribute("aria-label", "Account label")
    if (!pending.matches.length) box.append(label)
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
    if (!pending.matches.length)
      box.append(node("label", "Project"), projectChoice, projectName)
    const error = node("p", "", "error")
    error.setAttribute("role", "alert")
    box.append(error)
    const actions = node("div", "", "actions")
    const save = node(
      "button",
      pending.matches.length ? "Update saved" : "Save login",
      "primary"
    )
    const dismiss = node("button", "Not now")
    function close() {
      box.remove()
      prompt = null
      clearTimeout(expiry)
    }
    dismiss.onclick = () => {
      void send({ type: "dismiss", id: pending.id }).catch(() => {})
      close()
    }
    save.onclick = async (event) => {
      // Page JavaScript can reach an open Shadow DOM, but cannot forge a trusted
      // click. A scripted click must never save or overwrite shared credentials.
      if (!event.isTrusted) return
      save.disabled = true
      dismiss.disabled = true
      try {
        await send({
          type: "confirm",
          id: pending.id,
          accountId: choice.value || undefined,
          label: label.value,
          projectName: projectName.value,
          projectId: projectChoice.value || null,
        })
        await refresh()
        box.replaceChildren(
          node(
            "h2",
            pending.matches.length ? "Password updated" : "Login saved"
          ),
          node("p", "Synced with DevLogin", "muted")
        )
        expiry = setTimeout(close, 2000)
      } catch (failure) {
        error.textContent =
          failure instanceof Error ? failure.message : "Could not save"
        save.disabled = false
        dismiss.disabled = false
      }
    }
    actions.append(save, dismiss)
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
        ?.querySelector<HTMLButtonElement>(".actions button:last-child")
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
