export type Submission = {
  email: string
  password: string
  kind: "login" | "change" | "signup"
}
const usable = (input: HTMLInputElement) =>
  !input.disabled &&
  !input.readOnly &&
  input.getClientRects().length > 0 &&
  !/otp|one.?time|token|verification|security.?code/i.test(
    `${input.name} ${input.id} ${input.autocomplete}`
  )
export function readSubmission(root: ParentNode): Submission | null {
  const inputs = [...root.querySelectorAll<HTMLInputElement>("input")].filter(
    usable
  )
  const passwords = inputs.filter((input) => input.type === "password")
  if (!passwords.length) return null
  const fresh = passwords.filter(
    (input) =>
      input.autocomplete === "new-password" ||
      /new|confirm|repeat/i.test(`${input.name} ${input.id}`)
  )
  const selected = fresh[0] ?? passwords[0]!
  if (!selected.value || selected.value.length > 4096) return null
  // Never mistake a current password or a mismatched confirmation for the new one.
  if (fresh.some((input) => input.value !== selected.value)) return null
  if (passwords.length > 1 && !fresh.length) return null
  const text = inputs.filter((input) =>
    ["text", "email", "tel"].includes(input.type)
  )
  const email =
    text.find(
      (input) =>
        input.type === "email" ||
        /^(username|email)$/i.test(input.autocomplete) ||
        /email|user|login/i.test(`${input.name} ${input.id}`)
    ) ??
    // Sign-in forms only: use the text field just before the password, as browsers do.
    (fresh.length ? [] : text)
      .filter(
        (input) =>
          input.compareDocumentPosition(selected) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
      .at(-1)
  const description = `${root instanceof Element ? root.textContent : ""} ${root instanceof Element ? root.id : ""}`
  const kind = fresh.length
    ? /sign.?up|register|create account/i.test(description ?? "")
      ? "signup"
      : "change"
    : "login"
  if (!email?.value && kind !== "change") return null
  return { email: email?.value.trim() ?? "", password: selected.value, kind }
}
