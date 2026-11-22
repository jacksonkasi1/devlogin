import brandSvg from "../../web/public/favicon.svg?raw"
import type { Account } from "@workspace/shared"

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text = ""
) {
  const el = document.createElement(tag)
  el.className = cls
  el.textContent = text
  return el
}

function identity(account: Account) {
  const avatar = element(
    "span",
    "fp-avatar",
    account.label.slice(0, 2).toUpperCase()
  )
  avatar.setAttribute("aria-hidden", "true")
  const text = element("span", "fp-identity")
  text.append(
    element("strong", "", account.label),
    element("small", "", account.email)
  )
  return [avatar, text]
}

export function floatingPicker(
  accounts: Account[],
  submit: boolean,
  fill: (id: string) => Promise<void>,
  dismiss: () => void
) {
  const box = element("section", "surface floating-login")
  box.setAttribute("aria-label", "Global Login saved sign-in")
  const action = submit ? "Sign in" : "Fill login"
  const bar = element("div", "fp-bar")
  const primary = element("button", "fp-action", action)
  const other = element("button", "fp-other", "Other logins ⌄")
  const close = () => {
    const button = element("button", "fp-close", "×")
    button.setAttribute("aria-label", "Dismiss floating login")
    button.onclick = dismiss
    return button
  }
  const error = element("small", "fp-error")
  error.setAttribute("role", "status")
  let busy = false
  async function use(account: Account, event: Event) {
    if (!event.isTrusted || busy || !box.isConnected) return
    busy = true
    try {
      await fill(account.id)
      dismiss()
    } catch {
      error.textContent = "Could not fill this login. Try again."
    } finally {
      busy = false
    }
  }
  const first = accounts[0]!
  primary.onclick = (e) => void use(first, e)
  bar.append(...identity(first), primary, close())
  other.setAttribute("aria-expanded", "false")
  function compact() {
    box.classList.remove("fp-expanded")
    box.replaceChildren(bar)
    if (accounts.length > 1) box.append(other)
    box.append(error)
    other.setAttribute("aria-expanded", "false")
  }
  function expand() {
    box.classList.add("fp-expanded")
    other.setAttribute("aria-expanded", "true")
    const header = element("div", "fp-searchbar")
    const mark = element("img", "fp-mark")
    mark.src = "data:image/svg+xml," + encodeURIComponent(brandSvg)
    mark.alt = ""
    mark.setAttribute("aria-hidden", "true")
    const search = element("input", "fp-search")
    search.placeholder = "Type to find a login…"
    search.setAttribute("aria-label", "Find a saved login")
    search.autocomplete = "off"
    search.setAttribute("role", "combobox")
    search.setAttribute("aria-expanded", "true")
    search.setAttribute("aria-controls", "fp-results")
    header.append(mark, search, close())
    const list = element("div", "fp-list")
    list.id = "fp-results"
    list.setAttribute("role", "listbox")
    list.setAttribute("aria-label", "Matching logins")
    const footer = element(
      "small",
      "fp-footer",
      "↵  " + action + "　 ↑ ↓  Select login"
    )
    box.replaceChildren(header, list, footer, error)
    let results = accounts
    let active = 0
    function highlight(index: number) {
      active = index
      Array.from(list.children).forEach((el, i) =>
        el.setAttribute("aria-selected", String(i === index))
      )
      const row = list.children[index]
      if (row) {
        search.setAttribute("aria-activedescendant", row.id)
        row.scrollIntoView({ block: "nearest" })
      } else search.removeAttribute("aria-activedescendant")
    }
    function render() {
      const q = search.value.trim().toLowerCase()
      results = accounts.filter((a) =>
        (a.label + " " + a.email).toLowerCase().includes(q)
      )
      list.replaceChildren()
      results.forEach((a, i) => {
        const row = element("button", "fp-row")
        row.type = "button"
        row.tabIndex = -1
        row.id = "fp-option-" + i
        row.setAttribute("role", "option")
        const key = element("span", "fp-key")
        key.setAttribute("aria-hidden", "true")
        row.append(...identity(a), key)
        row.onpointermove = () => {
          if (active !== i) highlight(i)
        }
        row.onpointerdown = (e) => e.preventDefault()
        row.onclick = (e) => void use(a, e)
        list.append(row)
      })
      if (!results.length)
        list.append(element("p", "fp-empty", "No matching logins"))
      highlight(results.length ? 0 : -1)
    }
    search.oninput = render
    search.onkeydown = (e) => {
      if (e.isComposing) return
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        compact()
        other.focus()
        return
      }
      if (!results.length) return
      if (e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        void use(results[active]!, e)
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        highlight(
          (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) %
            results.length
        )
      }
    }
    render()
    search.focus({ preventScroll: true })
  }
  other.onclick = expand
  compact()
  return box
}
