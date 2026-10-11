import { browser } from "wxt/browser"
import { ApiError } from "@workspace/shared"
import type { Message, Reply } from "./messages"
export async function send<T>(message: Message): Promise<T> {
  const response = (await browser.runtime.sendMessage(message)) as Reply<T>
  if (!response?.ok)
    throw new ApiError(
      response?.error ?? "Extension could not respond",
      response && !response.ok ? (response.status ?? 500) : 500
    )
  return response.data
}
