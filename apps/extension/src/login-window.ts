import { browser } from "wxt/browser"
import type { Account } from "@workspace/shared"

export const savedLoginKey = "lastSavedLogin"
export type SavedLogin = Pick<Account, "id" | "project_id">

export function openLoginWindow({
  accountId,
  projectId,
  tabId,
}: {
  accountId?: string
  projectId?: string
  tabId?: number
}) {
  const url = new URL(browser.runtime.getURL("/edit-login.html"))
  if (accountId) url.searchParams.set("account", accountId)
  if (projectId) url.searchParams.set("project", projectId)
  if (tabId !== undefined) url.searchParams.set("tab", String(tabId))
  return browser.windows.create({
    url: url.href,
    type: "popup",
    width: 530,
    height: 690,
    focused: true,
  })
}
