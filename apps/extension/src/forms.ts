import { localAddress, readPageIdentity, sameIdentity } from "./local-identity"
import { isLoginPage, accountMatches, type Project } from "@workspace/shared"
import type { Fill } from "./messages"

const visible = (element: Element) =>
  element instanceof HTMLElement &&
  element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== "hidden"
function select<T extends Element>(
  selector: string,
  fallback: string,
  root: ParentNode = document
): T | null {
  const candidates = root.querySelectorAll<T>(selector || fallback)
  return [...candidates].find(visible) ?? null
}
export function detectForm(project: Project) {
  const password = select<HTMLInputElement>(
    project.selectors.password,
    'input[type="password"]:not([autocomplete="new-password"])'
  )
  if (
    !password ||
    password.disabled ||
    password.readOnly ||
    !(password instanceof HTMLInputElement)
  )
    return null
  const root = password.form ?? document
  const email = select<HTMLInputElement>(
    project.selectors.email,
    'input[type="email"], input[autocomplete="username"], input[name="email"], input[name="username"], input[id="email"], input[type="text"]',
    root
  )
  if (
    !email ||
    email === password ||
    email.disabled ||
    email.readOnly ||
    !(email instanceof HTMLInputElement)
  )
    return null
  const submit = select<HTMLElement>(
    project.selectors.submit,
    'button[type="submit"], input[type="submit"], button:not([type])',
    root
  )
  return { email, password, submit, form: password.form }
}
export function googleButton(project: Project): HTMLElement | null {
  if (project.selectors.google)
    return select<HTMLElement>(project.selectors.google, "")
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
