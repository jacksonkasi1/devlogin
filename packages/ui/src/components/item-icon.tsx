import { useState } from "react"
import { Folder, KeyRound, Terminal, Globe, Code, Database } from "lucide-react"
import { Button } from "./button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "./dropdown-menu"
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
  return (
    <div className="flex flex-col items-center gap-2">
      <ItemIcon icon={value} large folder={folder} />
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="sm" />}
        >
          Change Icon
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 p-2">
          <div className="grid grid-cols-6 gap-1">
            {[...emoji, ...Object.keys(icons)].map((icon) => (
              <Button
                key={icon}
                type="button"
                size="icon"
                variant={value === icon ? "secondary" : "ghost"}
                aria-label={`Use ${icon} icon`}
                onClick={() => {
                  onChange(icon)
                  setOpen(false)
                }}
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
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
          >
            {folder ? "Default folder icon" : "Use website favicon"}
          </Button>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
