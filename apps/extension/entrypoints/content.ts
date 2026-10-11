import { defineContentScript } from "wxt/utils/define-content-script"
import { browser } from "wxt/browser"
import { send } from "../src/client"
import type { Context, Fill, PageContext, Pending } from "../src/messages"
import { detectForm, fillForm, googleButton } from "../src/forms"
import { readSubmission } from "../src/submission"
import type { UiSettings } from "../src/ui-settings"
import { inpage } from "../src/inpage"

export default defineContentScript({
  registration: "runtime",
  runAt: "document_idle",
  main(ctx) {
    if (window.top !== window || document.querySelector("devlogin-ui")) return
    // Do not inject any UI or read form values on Google's authentication pages.
    if (
      /(^|\.)(google\.com|googleapis\.com|gstatic\.com)$/.test(
        location.hostname
      )
    )
      return
    let busy = false
    let filling = false
    let lastCheck = 0
    let completedUrl = ""
    let previousUrl = location.href
    let pageContext: PageContext | null = null
    let pageAt = 0
    let lastObserved = ""
    async function perform(instruction: Fill) {
      filling = true
      try {
        const result = await fillForm(instruction)
        if (instruction.submit) completedUrl = location.href
        return result
      } finally {
        filling = false
      }
    }
    const ui = inpage(perform, async () => {
      pageContext = await send<PageContext>({ type: "page" })
      pageAt = Date.now()
    })
    async function pending() {
      try {
        const candidate = await send<Pending | null>({ type: "pending" })
        if (candidate) ui.showPending(candidate)
      } catch {
        /* Signed-out or excluded websites never show credential UI. */
      }
    }
    async function tick() {
      if (busy || Date.now() - lastCheck < 3000) return
      busy = true
      lastCheck = Date.now()
      try {
        if (Date.now() - pageAt > 30_000) {
          pageContext = await send<PageContext>({ type: "page" })
          pageAt = Date.now()
          ui.setSettings(pageContext.settings)
        }
        if (completedUrl === location.href) return
        const context = await send<Context>({ type: "context" })
        if (!context) return
        if (context.account.login_type === "password") {
          const fields = detectForm(context.project)
          if (!fields || fields.email.value || fields.password.value) return
        } else if (!googleButton(context.project)) return
        const instruction = await send<Fill | null>({
          type: "automatic",
          projectId: context.project.id,
          accountId: context.account.id,
        })
        if (!instruction) return
        completedUrl = location.href
        await perform(instruction)
      } catch {
        pageContext = null
        ui.closeSuggestions()
      } finally {
        busy = false
      }
    }
    async function observe(root: ParentNode) {
      if (filling || !pageContext?.admin) return
      const data = readSubmission(root)
      if (!data) return
      try {
        // Deduplicate submit/click events without retaining passwords in content-script state.
        let signature = 0
        for (const char of JSON.stringify(data))
          signature = ((signature << 5) - signature + char.charCodeAt(0)) | 0
        const hash = String(signature)
        if (hash === lastObserved) return
        lastObserved = hash
        ctx.setTimeout(() => {
          lastObserved = ""
        }, 5000)
        await send({ type: "observe", ...data })
        ctx.setTimeout(() => {
          void pending()
        }, 700)
      } catch {
        /* Unapproved users and unauthorized sites are ignored. */
      }
    }
    const submit = (event: Event) => {
      if (event.target instanceof HTMLFormElement) void observe(event.target)
    }
    const click = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              'button,input[type="submit"],[role="button"]'
            )
          : null
      if (
        !target ||
        !/log.?in|sign.?in|sign.?up|register|save|update|reset|change password/i.test(
          target.textContent || target.getAttribute("value") || ""
        )
      )
        return
      const form = target.closest("form")
      if (form) {
        if ((target as HTMLButtonElement).type === "button") void observe(form)
      } else
        void observe(
          target.closest('[role="form"],section,main') ??
            target.parentElement ??
            document
        )
    }
    const focus = async (event: FocusEvent) => {
      if (filling || !(event.target instanceof HTMLInputElement)) return
      ui.closeSuggestions()
      const input = event.target
      try {
        if (
          !pageContext ||
          location.hostname === "localhost" ||
          location.hostname === "127.0.0.1" ||
          location.hostname === "[::1]"
        ) {
          pageContext = await send<PageContext>({ type: "page" })
          pageAt = Date.now()
          ui.setSettings(pageContext.settings)
        }
        if (filling || document.activeElement !== input || !pageContext.project)
          return
        const fields = detectForm(pageContext.project)
        if (fields && (input === fields.email || input === fields.password))
          ui.suggest(input, pageContext)
      } catch {
        ui.closeSuggestions()
      }
    }
    document.addEventListener("submit", submit, true)
    document.addEventListener("click", click, true)
    document.addEventListener("focusin", focus, true)
    browser.runtime.onMessage.addListener(
      (
        message:
          | Fill
          | { type: "ui-settings-changed"; settings: UiSettings }
          | { type: "local-identity-changed" },
        sender,
        respond
      ) => {
        if (sender.id !== browser.runtime.id) return
        if (message.type === "local-identity-changed") {
          pageContext = null
          pageAt = 0
          completedUrl = ""
          ui.closeSuggestions()
          void tick()
          return
        }
        if (message.type === "ui-settings-changed") {
          ui.setSettings(message.settings)
          if (pageContext) pageContext.settings = message.settings
          return
        }
        if (message.type !== "fill") return
        completedUrl = location.href
        void perform(message).then(
          (data) => respond({ ok: true, data }),
          (error) =>
            respond({
              ok: false,
              error:
                error instanceof Error ? error.message : "Could not fill form",
            })
        )
        return true
      }
    )
    void tick()
    void pending()
    ctx.setTimeout(() => {
      void pending()
    }, 1000)
    ctx.setTimeout(() => {
      void pending()
    }, 3000)
    const observer = new MutationObserver(() => {
      void tick()
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
    ctx.setInterval(() => {
      if (previousUrl !== location.href) {
        previousUrl = location.href
        completedUrl = ""
        lastCheck = 0
        pageAt = 0
        pageContext = null
        ui.closeSuggestions()
        void tick()
        void pending()
      }
    }, 1000)
    ctx.setInterval(() => {
      void tick()
    }, 3000)
    ctx.onInvalidated(() => {
      observer.disconnect()
      ui.destroy()
      document.removeEventListener("submit", submit, true)
      document.removeEventListener("click", click, true)
      document.removeEventListener("focusin", focus, true)
    })
  },
})
