import { useState } from "react"
import {
  Folder,
  KeyRound,
  Terminal,
  Globe,
  Code,
  Database,
  Plus,
  ArrowLeft,
} from "lucide-react"
import { Button } from "./button"
import { Input } from "./input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./select"
import { Popover, PopoverTrigger, PopoverContent } from "./popover"
const icons = {
  folder: Folder,
  key: KeyRound,
  terminal: Terminal,
  globe: Globe,
  code: Code,
  database: Database,
}
const emoji = [
  "📁",
  "🚀",
  "💻",
  "🔑",
  "🌐",
  "🏠",
  "🧪",
  "🎨",
  "📚",
  "👥",
  "🦚",
  "⚡",
]
export function ItemIcon({
  icon,
  website,
  large = false,
  folder = false,
  small = false,
}: {
  icon?: string
  website?: string
  large?: boolean
  folder?: boolean
  small?: boolean
}) {
  const [failed, setFailed] = useState<string>()
  const Icon = icons[icon as keyof typeof icons] ?? (folder ? Folder : KeyRound)
  const favicon =
    !icon && website ? new URL("/favicon.ico", website).href : undefined
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground ${large ? "size-14 text-2xl" : small ? "size-6 text-sm" : "size-8 text-base"}`}
    >
      {icon && !(icon in icons) ? (
        icon
      ) : (
        <Icon className={large ? "size-6" : "size-4"} />
      )}
      {favicon && failed !== favicon && (
        <img
          src={favicon}
          referrerPolicy="no-referrer"
          alt=""
          className="absolute size-5 bg-muted object-contain"
          onError={() => setFailed(favicon)}
        />
      )}
    </span>
  )
}
export function IconPicker({
  value,
  onChange,
  folder = false,
}: {
  value: string
  onChange: (icon: string) => void
  folder?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [entries, setEntries] = useState<[string, string, string][]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("All")
  const [limit, setLimit] = useState(120)
  const choose = (icon: string) => {
    onChange(icon)
    setOpen(false)
  }
  async function more() {
    setExpanded(true)
    if (entries.length || loading) return
    setLoading(true)
    setLoadError(false)
    try {
      setEntries((await import("../lib/emoji-data")).emojis)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }
  const search = query.trim().toLowerCase()
  const results = entries.filter(
    ([symbol, name, group]) =>
      (category === "All" || category === group) &&
      (!search ||
        symbol === search ||
        search.split(/\s+/).every((word) => name.toLowerCase().includes(word)))
  )
  const pasted = query.trim()
  const singleEmoji =
    pasted.length <= 32 &&
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(pasted) &&
    [
      ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
        pasted
      ),
    ].length === 1
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label="Change icon preview"
        className="rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen(true)}
      >
        <ItemIcon icon={value} large folder={folder} />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button type="button" variant="ghost" size="sm" />}
        >
          Change Icon
        </PopoverTrigger>
        <PopoverContent
          aria-label="Choose icon"
          className={`${expanded ? "w-80" : "w-56"} max-w-[calc(100vw-2rem)] p-2`}
        >
          {expanded ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Back to quick icons"
                  onClick={() => setExpanded(false)}
                >
                  <ArrowLeft />
                </Button>
                <span className="text-sm font-medium">All emojis</span>
              </div>
              <Input
                aria-label="Search emojis or paste one"
                placeholder="Search emojis or paste one…"
                value={query}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    if (singleEmoji) choose(pasted)
                  }
                }}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setCategory("All")
                  setLimit(120)
                }}
              />
              <Select
                value={category}
                onValueChange={(value) => {
                  setCategory(String(value))
                  setLimit(120)
                }}
              >
                <SelectTrigger aria-label="Emoji category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["All", ...new Set(entries.map((entry) => entry[2]))].map(
                    (group) => (
                      <SelectItem key={group} value={group}>
                        {group}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              {singleEmoji && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => choose(pasted)}
                >
                  Use {pasted}
                </Button>
              )}
              <div
                className="max-h-60 overflow-y-auto overscroll-contain"
                role="region"
                aria-label="Emoji results"
              >
                <div className="grid grid-cols-7 gap-1">
                  {results.slice(0, limit).map(([symbol, name]) => (
                    <Button
                      key={symbol}
                      type="button"
                      size="icon"
                      variant={value === symbol ? "secondary" : "ghost"}
                      title={name}
                      aria-label={`Use ${name} emoji`}
                      className="text-xl"
                      onClick={() => choose(symbol)}
                    >
                      {symbol}
                    </Button>
                  ))}
                </div>
                {loading && (
                  <p className="p-3 text-sm text-muted-foreground">
                    Loading emojis…
                  </p>
                )}
                {loadError && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => void more()}
                  >
                    Retry loading emojis
                  </Button>
                )}
                {!loading && !loadError && !results.length && (
                  <p className="p-3 text-sm text-muted-foreground">
                    No matching emojis
                  </p>
                )}
                {results.length > limit && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 w-full"
                    onClick={() => setLimit(limit + 120)}
                  >
                    Show more emojis
                  </Button>
                )}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {results.length.toLocaleString()} emojis
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-6 gap-1">
                {[...emoji, ...Object.keys(icons)].map((icon) => (
                  <Button
                    key={icon}
                    type="button"
                    size="icon"
                    variant={value === icon ? "secondary" : "ghost"}
                    aria-label={`Use ${icon} icon`}
                    onClick={() => choose(icon)}
                  >
                    {icon in icons ? <ItemIcon icon={icon} /> : icon}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => void more()}
              >
                <Plus /> More emojis
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full"
                onClick={() => choose("")}
              >
                {folder ? "Default folder icon" : "Use website favicon"}
              </Button>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
