import { localAddress, readPageIdentity, sameIdentity } from "./local-identity"
import { isLoginPage, accountMatches, type Project } from "@workspace/shared"
import type { Fill } from "./messages"

const visible = (element: Element) => {
  if (!(element instanceof HTMLElement) || !element.getClientRects().length)
    return false
  const rect = element.getBoundingClientRect()
  // Zero-size and invisible inputs are typically honeypots or offscreen clones.
  return (
    rect.width > 1 &&
    rect.height > 1 &&
    getComputedStyle(element).visibility !== "hidden"
  )
}
const usable = (input: Element): input is HTMLInputElement =>
  input instanceof HTMLInputElement &&
  !input.disabled &&
  !input.readOnly &&
  visible(input)
const textLike = (input: HTMLInputElement) =>
  // The browser normalises case and treats unknown types as "text".
  ["text", "email", "tel"].includes(input.type)
// Ordered from the most to the least explicit username signal.
const usernameSelectors = [
  'input[autocomplete~="username"]',
  'input[type="email"]',
  'input[autocomplete~="email"]',
  'input[name="email" i], input[name="username" i], input[id="email" i], input[id="username" i]',
  'input[name*="user" i], input[name*="login" i], input[name*="email" i], input[id*="user" i], input[id*="login" i], input[id*="email" i]',
]
function first<T extends Element>(
  root: ParentNode,
  selectors: string[],
  accept: (element: T) => boolean
): T | null {
  for (const selector of selectors) {
    const match = [...root.querySelectorAll<T>(selector)].find(accept)
    if (match) return match
  }
  return null
}
function usernameField(root: ParentNode, password: HTMLInputElement) {
  const accept = (input: HTMLInputElement) =>
    input !== password && usable(input) && textLike(input)
  const explicit = first(root, usernameSelectors, accept)
  if (explicit) return explicit
  // Otherwise use the text field closest before the password, as browsers do.
  const before = [...root.querySelectorAll<HTMLInputElement>("input")].filter(
    (input) =>
      accept(input) &&
      input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING
  )
  return before.at(-1) ?? null
}
// Formless (SPA) pages: the nearest container that also holds a username field.
function formRoot(password: HTMLInputElement): ParentNode {
  if (password.form) return password.form
  let node = password.parentElement
  for (let depth = 0; node && depth < 8; depth++, node = node.parentElement)
    if (usernameField(node, password)) return node
  return document
}
const revealToggle = /show|hide|reveal|toggle|eye|visibility|forgot/i
// "Continue with Google" and similar start a different sign-in flow.
const otherSignIn =
  /\bwith\s+(google|github|microsoft|apple|facebook|sso|saml|passkey)\b|\b(sso|passkey)\b/i
const buttonLabel = (element: HTMLElement) =>
  `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""} ${
    element instanceof HTMLInputElement ? element.value : ""
  }`
function pickSubmit(scope: ParentNode, password: HTMLInputElement) {
  const candidates = [
    ...scope.querySelectorAll<HTMLElement>(
      'button, input[type="submit"], [role="button"]'
    ),
  ].filter((element) => {
    const label = buttonLabel(element)
    return (
      visible(element) &&
      !(element as HTMLButtonElement).disabled &&
      !revealToggle.test(label) &&
      !otherSignIn.test(label)
    )
  })
  // Buttons after the password field are the likely submit buttons.
  const after = (element: HTMLElement) =>
    Boolean(
      password.compareDocumentPosition(element) &
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  const ordered = [
    ...candidates.filter(after),
    ...candidates.filter((element) => !after(element)),
  ]
  // A button without a type submits its form, just like type="submit".
  const submits = (element: HTMLElement) =>
    element.matches('[type="submit"]') ||
    (element.matches("button:not([type])") && Boolean(element.closest("form")))
  return (
    ordered.find(submits) ??
    ordered.find((element) =>
      /log\s*in|sign\s*in|continue|submit|next/i.test(buttonLabel(element))
    ) ??
    ordered.find((element) => element.matches("button:not([type])")) ??
    null
  )
}
function submitButton(root: ParentNode, password: HTMLInputElement) {
  // Formless pages often keep the button in a sibling container: widen gradually.
  let scope: ParentNode | null = root
  while (scope) {
    const match = pickSubmit(scope, password)
    if (match || scope === document || password.form) return match
    scope = (scope as Element).parentElement ?? document
  }
  return null
}
function custom<T extends Element>(
  selector: string,
  root: ParentNode = document
) {
  return [...root.querySelectorAll<T>(selector)].find(visible) ?? null
}
export function detectForm(project: Project) {
  const password = project.selectors.password
    ? custom<HTMLInputElement>(project.selectors.password)
    : ([
        ...document.querySelectorAll<HTMLInputElement>(
          'input[type="password"]:not([autocomplete="new-password"])'
        ),
      ].find(usable) ?? null)
  if (!password || !usable(password)) return null
  const root = formRoot(password)
  // Custom selectors are written against the whole form or page.
  const scope = password.form ?? document
  const email = project.selectors.email
    ? custom<HTMLInputElement>(project.selectors.email, scope)
    : usernameField(root, password)
  if (!email || email === password || !usable(email)) return null
  const submit = project.selectors.submit
    ? custom<HTMLElement>(project.selectors.submit, scope)
    : submitButton(root, password)
  return { email, password, submit, form: password.form }
}
export function googleButton(project: Project): HTMLElement | null {
  if (project.selectors.google)
    return custom<HTMLElement>(project.selectors.google)
  return (
    [
      ...document.querySelectorAll<HTMLElement>('button, a, [role="button"]'),
    ].find(
      (element) =>
        visible(element) &&
        /(?:sign\s*in|log\s*in|continue)\s+with\s+google/i.test(
          element.textContent ?? ""
        )
    ) ?? null
  )
}
function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  if (!setter) throw new Error("Unsupported input field")
  input.focus()
  setter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
  input.blur()
}
export async function fillForm(instruction: Fill): Promise<string> {
  if (
    !isLoginPage(instruction.project, location.href) ||
    !accountMatches(instruction.account, location.href)
  )
    throw new Error("This is not the saved login URL")
  if (
    localAddress(location.href) &&
    (!instruction.identity ||
      !sameIdentity(instruction.identity, readPageIdentity()))
  )
    throw new Error(
      "Local project identity changed. Identify this project again before filling."
    )
  if (instruction.account.login_type === "google") {
    const button = googleButton(instruction.project)
    if (!button)
      throw new Error(
        "Google sign-in button not found. Set a custom Google selector."
      )
    button.click()
    return "Google sign-in opened. Complete Google’s account selection."
  }
  const fields = detectForm(instruction.project)
  if (!fields)
    throw new Error(
      "Login fields not found. Set custom selectors in the login’s advanced website settings."
    )
  if (instruction.automatic && (fields.email.value || fields.password.value))
    throw new Error("Fields already contain user input")
  setInput(fields.email, instruction.account.email)
  setInput(fields.password, instruction.password)
  if (!instruction.submit) return "Email and password filled"
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )
  if (
    !isLoginPage(instruction.project, location.href) ||
    !fields.password.isConnected ||
    (instruction.identity &&
      !sameIdentity(instruction.identity, readPageIdentity()))
  )
    throw new Error("Page changed before login submission")
  if (fields.form && !fields.form.checkValidity()) {
    if (instruction.submitIfValid)
      return "Filled. Complete the remaining required form fields."
    throw new Error("Complete the remaining required form fields")
  }
  if (fields.submit) fields.submit.click()
  else if (fields.form) fields.form.requestSubmit()
  else throw new Error("Submit button not found. Set a custom submit selector.")
  return "Login submitted"
}
