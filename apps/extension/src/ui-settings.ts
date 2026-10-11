import { browser } from "wxt/browser"

export type UiSettings = {
  theme: "light" | "dark" | "system"
  submitAfterFill: boolean
}

export async function readUiSettings(): Promise<UiSettings> {
  const { uiSettings } = await browser.storage.local.get("uiSettings")
  const value = uiSettings as Partial<UiSettings> | undefined
  return {
    theme:
      value?.theme === "light" || value?.theme === "dark"
        ? value.theme
        : "system",
    submitAfterFill:
      typeof value?.submitAfterFill === "boolean"
        ? value.submitAfterFill
        : true,
  }
}

export async function saveUiSettings(patch: Partial<UiSettings>) {
  const current = await readUiSettings()
  if (
    patch.theme !== undefined &&
    !["light", "dark", "system"].includes(patch.theme)
  )
    throw new Error("Invalid appearance")
  if (
    patch.submitAfterFill !== undefined &&
    typeof patch.submitAfterFill !== "boolean"
  )
    throw new Error("Invalid autofill setting")
  const settings = {
    theme: patch.theme ?? current.theme,
    submitAfterFill: patch.submitAfterFill ?? current.submitAfterFill,
  }
  await browser.storage.local.set({ uiSettings: settings })
  const tabs = await browser.tabs.query({})
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id)
      .map((tab) =>
        browser.tabs.sendMessage(tab.id!, {
          type: "ui-settings-changed",
          settings,
        })
      )
  )
  return settings
}
