import type { Account } from "@workspace/shared"

export function accountTone(account: Account) {
  const role = account.label.toLowerCase()
  if (/admin|owner/.test(role))
    return {
      hue: 35,
      classes: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    }
  if (/test|qa/.test(role))
    return {
      hue: 275,
      classes: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    }
  if (account.is_default)
    return {
      hue: 150,
      classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    }
  return {
    hue: 215,
    classes: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  }
}
