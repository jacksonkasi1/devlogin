import { useEffect, useMemo, useRef, useState } from "react"
import { ItemIcon } from "@workspace/ui/components/login-icon"
import { Button } from "@workspace/ui/components/button"
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Search,
} from "@workspace/ui/components/devlogin-icons"
import type { Snapshot } from "./messages"
import {
  autofill,
  copyText,
  modKey,
  readNote,
  readPassword,
  searchVault,
  vaultItems,
  type VaultItem,
} from "./vault"

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="quick-kbd">{children}</kbd>
}

export function QuickAccess({
  session,
  embedded,
}: {
  session: Promise<Snapshot>
  embedded: boolean
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [failure, setFailure] = useState("")
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(
    null
  )
  const [status, setStatus] = useState<{ error: boolean; text: string }>()
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  // A framed overlay acts only while really visible, so a page cannot hide or
  // cover it and trick clicks or keys into it (IntersectionObserver v2).
  const visible = useRef(!embedded)
  useEffect(() => {
    if (!embedded || !shell.current) return
    try {
      const observer = new IntersectionObserver(
        ([entry]) => {
          visible.current =
            (entry as IntersectionObserverEntry & { isVisible?: boolean })
              .isVisible ?? !!entry?.isIntersecting
        },
        { trackVisibility: true, delay: 100 } as IntersectionObserverInit
      )
      observer.observe(shell.current)
      return () => observer.disconnect()
    } catch {
      visible.current = true
    }
  }, [embedded])
  const close = () => {
    if (embedded) parent.postMessage({ type: "global-login-quick-close" }, "*")
    else window.close()
  }
  useEffect(() => {
    session.then(setSnapshot, (error) =>
      setFailure(error instanceof Error ? error.message : "Unavailable")
    )
    const focus = () => input.current?.focus()
    window.addEventListener("focus", focus)
    focus()
    return () => window.removeEventListener("focus", focus)
  }, [session])
  useEffect(() => {
    const theme = snapshot?.settings.theme ?? localStorage.getItem("theme")
    const media = matchMedia("(prefers-color-scheme: dark)")
    document.documentElement.classList.toggle(
      "dark",
      theme === "dark" || (theme !== "light" && media.matches)
    )
    input.current?.focus()
  }, [snapshot])
  const items = useMemo(
    () => searchVault(vaultItems(snapshot?.data, snapshot?.tabUrl), query),
    [snapshot, query]
  )
  const selected: VaultItem | undefined =
    items[Math.min(index, items.length - 1)]
  useEffect(() => setIndex(0), [query])
  useEffect(() => setSecret(null), [selected?.id])
  useEffect(() => {
    if (!secret) return
    const timer = setTimeout(() => setSecret(null), 30_000)
    return () => clearTimeout(timer)
  }, [secret])
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" })
  }, [index, items])
  async function run(action: () => Promise<string | void>, done?: () => void) {
    if (!visible.current) {
      setStatus({
        error: true,
        text: "Quick Access is covered by the page. Press Esc and try again.",
      })
      return
    }
    setBusy(true)
    try {
      const text = await action()
      if (text) setStatus({ error: false, text })
      done?.()
    } catch (error) {
      setStatus({
        error: true,
        text: error instanceof Error ? error.message : "Action failed",
      })
    } finally {
      setBusy(false)
    }
  }
  const secretOf = (item: VaultItem) =>
    secret?.id === item.id
      ? Promise.resolve(secret.value)
      : item.kind === "login"
        ? readPassword(item.id)
        : readNote(item.id)
  const copySecret = (item: VaultItem) =>
    run(async () => {
      if (item.kind === "login" && item.account.login_type !== "password")
        throw new Error("This login uses Google sign-in")
      await copyText(await secretOf(item))
      return item.kind === "login" ? "Password copied" : "Note copied"
    })
  const copyUsername = (item: VaultItem) =>
    item.kind === "login" &&
    run(async () => {
      await copyText(item.account.email)
      return "Username copied"
    })
  const primary = (item: VaultItem | undefined) => {
    if (!item || busy) return
    if (item.kind === "note")
      return run(
        async () => {
          await copyText(await secretOf(item))
          return "Note copied"
        },
        () => setTimeout(close, 450)
      )
    return run(
      () =>
        autofill(item, {
          tabUrl: snapshot?.tabUrl ?? "",
          tabId: snapshot?.tabId,
          windowId: snapshot?.windowId,
          submit: snapshot?.settings.submitAfterFill ?? false,
        }),
      close
    )
  }
  function keydown(event: React.KeyboardEvent) {
    const mod = event.metaKey || event.ctrlKey
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!items.length) return
      const step = event.key === "ArrowDown" ? 1 : -1
      setIndex((current) => (current + step + items.length) % items.length)
    } else if (
      event.key === "Enter" &&
      event.target === input.current &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      void primary(selected)
    } else if (event.key === "Escape") {
      event.preventDefault()
      if (query) setQuery("")
      else close()
    } else if (mod && event.key.toLowerCase() === "c" && selected) {
      const field = input.current
      // Keep normal copy when any text (search query or revealed note) is selected.
      if (
        (field && field.selectionStart !== field.selectionEnd) ||
        window.getSelection()?.toString()
      )
        return
      event.preventDefault()
      void (event.shiftKey ? copyUsername(selected) : copySecret(selected))
    }
  }
  const signedOut = snapshot && (!snapshot.user?.approved || !snapshot.data)
  const host = (() => {
    try {
      return /^https?:/.test(snapshot?.tabUrl ?? "")
        ? new URL(snapshot!.tabUrl).host
        : ""
    } catch {
      return ""
    }
  })()
  let heading = ""
  return (
    <div ref={shell} className="quick-shell" onKeyDown={keydown}>
      <header className="quick-search">
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="quick-results"
          aria-activedescendant={selected ? `quick-${selected.id}` : undefined}
          aria-label="Search logins and notes"
          placeholder="Search logins and notes…"
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <Kbd>esc</Kbd>
      </header>
      {failure || signedOut ? (
        <div className="quick-empty">
          <KeyRound className="size-8 text-muted-foreground" />
          <p className="font-medium">
            {failure ||
              (!snapshot?.user
                ? "Sign in to Global Login"
                : !snapshot.user.approved
                  ? "Waiting for administrator approval"
                  : "Could not sync your vault")}
          </p>
          <p className="text-xs text-muted-foreground">
            {failure
              ? "Press the shortcut again."
              : "Open Global Login from the browser toolbar to continue."}
          </p>
        </div>
      ) : !snapshot ? (
        <div className="quick-empty text-muted-foreground">Loading…</div>
      ) : (
        <div className="quick-body">
          <div
            id="quick-results"
            ref={list}
            role="listbox"
            aria-label="Results"
            className="quick-list"
          >
            {items.map((item, position) => {
              const group = query
                ? ""
                : item.suggested
                  ? `Suggested for ${host}`
                  : item.kind === "login"
                    ? "Logins"
                    : "Secure notes"
              const showHeading = group !== heading
              heading = group
              return (
                <div key={item.id}>
                  {showHeading && group && (
                    <p className="quick-heading">{group}</p>
                  )}
                  <div
                    id={`quick-${item.id}`}
                    role="option"
                    aria-selected={item.id === selected?.id}
                    className="quick-row"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setIndex(position)}
                    onDoubleClick={() => void primary(item)}
                  >
                    <ItemIcon
                      icon={
                        item.kind === "login"
                          ? item.account.icon
                          : item.note.icon
                      }
                      website={item.kind === "login" ? item.website : undefined}
                      note={item.kind === "note"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    </span>
                  </div>
                </div>
              )
            })}
            {!items.length && (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {query
                  ? `No logins or notes match “${query}”`
                  : "Your vault is empty."}
              </p>
            )}
          </div>
          <section className="quick-detail" aria-label="Item details">
            {selected && (
              <>
                <div className="flex items-center gap-3">
                  <ItemIcon
                    icon={
                      selected.kind === "login"
                        ? selected.account.icon
                        : selected.note.icon
                    }
                    website={
                      selected.kind === "login" ? selected.website : undefined
                    }
                    note={selected.kind === "note"}
                    large
                  />
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">
                      {selected.title}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {selected.project?.name ??
                        (selected.kind === "note" ? "Secure note" : "")}
                    </p>
                  </div>
                </div>
                <Button
                  className="mt-4 w-full justify-between"
                  disabled={busy}
                  onClick={() => void primary(selected)}
                >
                  {selected.kind === "note"
                    ? "Copy note"
                    : selected.suggested
                      ? "Autofill"
                      : "Open & fill"}
                  <Kbd>↵</Kbd>
                </Button>
                <div className="quick-fields">
                  {selected.kind === "login" ? (
                    <>
                      <div className="quick-field">
                        <span className="min-w-0 flex-1">
                          <span className="field-label">Username</span>
                          <span className="block truncate">
                            {selected.account.email}
                          </span>
                        </span>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Copy username"
                          onClick={() => void copyUsername(selected)}
                        >
                          <Copy />
                        </Button>
                      </div>
                      <div className="quick-field">
                        <span className="min-w-0 flex-1">
                          <span className="field-label">Password</span>
                          <span className="block font-mono break-all">
                            {selected.account.login_type === "google"
                              ? "Google sign-in"
                              : secret?.id === selected.id
                                ? secret.value
                                : "••••••••••••"}
                          </span>
                        </span>
                        {selected.account.login_type === "password" && (
                          <>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={
                                secret?.id === selected.id
                                  ? "Hide password"
                                  : "Show password"
                              }
                              onClick={() =>
                                secret?.id === selected.id
                                  ? setSecret(null)
                                  : void run(async () =>
                                      setSecret({
                                        id: selected.id,
                                        value: await readPassword(selected.id),
                                      })
                                    )
                              }
                            >
                              {secret?.id === selected.id ? (
                                <EyeOff />
                              ) : (
                                <Eye />
                              )}
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Copy password"
                              onClick={() => void copySecret(selected)}
                            >
                              <Copy />
                            </Button>
                          </>
                        )}
                      </div>
                      {selected.website && (
                        <div className="quick-field">
                          <span className="min-w-0 flex-1">
                            <span className="field-label">Website</span>
                            <span className="block truncate">
                              {new URL(selected.website).host}
                            </span>
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="quick-field items-start">
                      <span className="min-w-0 flex-1">
                        <span className="field-label">Note</span>
                        <span className="block max-h-36 overflow-auto font-mono text-xs break-words whitespace-pre-wrap">
                          {secret?.id === selected.id
                            ? secret.value
                            : "••••••••••••"}
                        </span>
                      </span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={
                          secret?.id === selected.id ? "Hide note" : "Show note"
                        }
                        onClick={() =>
                          secret?.id === selected.id
                            ? setSecret(null)
                            : void run(async () =>
                                setSecret({
                                  id: selected.id,
                                  value: await readNote(selected.id),
                                })
                              )
                        }
                      >
                        {secret?.id === selected.id ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      <footer className="quick-footer">
        {status ? (
          <span
            role="status"
            className={status.error ? "text-destructive" : "text-foreground"}
          >
            {status.text}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-3">
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> Navigate
            </span>
            <span>
              <Kbd>↵</Kbd>{" "}
              {selected?.kind === "note" ? "Copy note" : "Autofill"}
            </span>
            <span>
              <Kbd>{modKey}</Kbd>
              <Kbd>C</Kbd> Copy{" "}
              {selected?.kind === "note" ? "note" : "password"}
            </span>
            {selected?.kind !== "note" && (
              <span>
                <Kbd>{modKey}</Kbd>
                <Kbd>⇧</Kbd>
                <Kbd>C</Kbd> Copy username
              </span>
            )}
          </span>
        )}
        <span className="ml-auto font-medium">Global Login</span>
      </footer>
    </div>
  )
}
