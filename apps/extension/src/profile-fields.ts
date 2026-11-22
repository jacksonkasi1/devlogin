import { personalFields } from "@workspace/shared"
// Called only from the extension window after the user chooses the displayed origin.
export function readOrFillProfile(fields?: Record<string, string>) {
  const result: Record<string, string> = {}
  const active = document.activeElement?.closest("form")
  const forms = Array.from(document.forms).filter(
    (form) =>
      form.querySelector("[autocomplete]") && form.getClientRects().length
  )
  const root = active ?? (forms.length === 1 ? forms[0] : undefined)
  if (!root) throw new Error("Focus a field in the signup form first")
  for (const input of root.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input[autocomplete],textarea[autocomplete]")) {
    const key = input.autocomplete.split(/\s+/).at(-1) ?? ""
    if (
      !Object.hasOwn(personalFields.profile, key) ||
      input.disabled ||
      input.readOnly ||
      !input.checkVisibility() ||
      ["password", "hidden", "file"].includes(input.type)
    )
      continue
    if (fields === undefined) {
      if (input.value) result[key] = input.value
    } else if (fields[key]) {
      const proto =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(
        input,
        fields[key]
      )
      input.dispatchEvent(new Event("input", { bubbles: true }))
      input.dispatchEvent(new Event("change", { bubbles: true }))
      result[key] = fields[key]
    }
  }
  if (!Object.keys(result).length)
    throw new Error("No matching profile fields on this form")
  return result
}
