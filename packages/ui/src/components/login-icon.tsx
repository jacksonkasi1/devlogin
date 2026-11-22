import { useState } from "react"
import { websiteFavicons, type WebsiteIcon } from "@workspace/shared"
import { Folder, KeyRound, Terminal, Globe, Code, Database } from "lucide-react"

export const itemIcons = {
  folder: Folder,
  key: KeyRound,
  terminal: Terminal,
  globe: Globe,
  code: Code,
  database: Database,
}

export function ItemIcon({
  icon,
  website,
  savedIcon,
  large = false,
  folder = false,
  small = false,
}: {
  icon?: string
  website?: string
  savedIcon?: WebsiteIcon | null
  large?: boolean
  folder?: boolean
  small?: boolean
}) {
  const [failed, setFailed] = useState<string[]>([])
  const Icon =
    itemIcons[icon as keyof typeof itemIcons] ?? (folder ? Folder : KeyRound)
  const candidates = websiteFavicons(website)
  if (
    savedIcon &&
    website &&
    candidates.length &&
    new URL(website).origin === savedIcon.origin
  ) {
    const asset = new URL(savedIcon.url)
    if (!asset.search) asset.searchParams.set("v", savedIcon.revision)
    candidates.unshift(asset.href)
  }
  const favicon =
    !icon && !folder
      ? candidates.find((url) => !failed.includes(url))
      : undefined
  return (
    <span
      aria-hidden
      data-slot="item-icon"
      className={`relative flex shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground ${large ? "size-14 text-2xl" : small ? "size-6 text-sm" : "size-8 text-base"}`}
    >
      {icon && !(icon in itemIcons) ? (
        icon
      ) : (
        <Icon className={large ? "size-6" : "size-4"} />
      )}
      {favicon && (
        <img
          key={favicon}
          src={favicon}
          referrerPolicy="no-referrer"
          alt=""
          className={`absolute ${large ? "size-9" : small ? "size-4" : "size-5"} bg-muted object-contain`}
          onError={() => setFailed((urls) => [...urls, favicon])}
        />
      )}
    </span>
  )
}
