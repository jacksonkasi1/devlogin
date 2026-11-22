import type { ComponentProps, ReactNode } from "react"
import { cn } from "cn"
import {
  Copy,
  EllipsisVertical,
  RefreshCw,
  Pencil,
  Search,
  Trash2,
} from "lucide-react"
import { Button } from "./button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu"
import { BrandMark } from "./brand-mark"
import type { WebsiteIcon } from "@workspace/shared"
import { Input } from "./input"
import { ItemIcon } from "./item-icon"
import { toast } from "./sonner"

export function VaultMark() {
  return (
    <span className="vault-mark" aria-hidden="true">
      <BrandMark globe className="size-full" />
    </span>
  )
}

export function VaultSearch(props: ComponentProps<typeof Input>) {
  return (
    <div className="vault-search">
      <Search size={15} aria-hidden="true" />
      <Input
        aria-label="Search logins"
        placeholder="Search logins…"
        {...props}
      />
    </div>
  )
}

export function LoginRow({
  name,
  username,
  icon,
  website,
  favicon,
  className,
  action,
  ...props
}: Omit<ComponentProps<"button">, "name"> & {
  name: string
  username: string
  icon?: string | null
  website?: string
  favicon?: WebsiteIcon | null
  action?: ReactNode
}) {
  const row = (
    <button type="button" className={cn("vault-row", className)} {...props}>
      <ItemIcon
        key={`${icon}:${website}`}
        icon={icon ?? undefined}
        website={website}
        savedIcon={favicon}
      />
      <span className="vault-row-text">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {username}
        </span>
      </span>
    </button>
  )
  return action ? (
    <div className="vault-row-with-action">
      {row}
      <div className="vault-row-action">{action}</div>
    </div>
  ) : (
    row
  )
}

export function LoginHeading({
  title,
  icon,
  website,
  favicon,
  children,
}: {
  title: string
  icon?: string | null
  website?: string
  favicon?: WebsiteIcon | null
  children?: ReactNode
}) {
  return (
    <div className="vault-identity">
      <ItemIcon
        key={`${icon}:${website}`}
        icon={icon ?? undefined}
        website={website}
        savedIcon={favicon}
        large
      />
      <h1>{title}</h1>
      {children}
    </div>
  )
}

export function CredentialRow({
  label,
  children,
  onCopy,
  action,
  busy,
}: {
  label: string
  children: ReactNode
  onCopy?: () => void
  action?: ReactNode
  busy?: boolean
}) {
  const value = (
    <span className="vault-value">
      <span className="vault-field-label">{label}</span>
      <span
        aria-label={label}
        className={cn("vault-field-value", label === "Password" && "font-mono")}
      >
        {children}
      </span>
    </span>
  )
  return (
    <div className="vault-credential">
      {onCopy ? (
        <button
          type="button"
          className="vault-copy"
          aria-label={`Copy ${label.toLowerCase()}`}
          disabled={busy}
          onClick={onCopy}
        >
          {value}
          <span className="vault-copy-label" aria-hidden="true">
            <Copy size={13} /> Copy
          </span>
        </button>
      ) : (
        value
      )}
      {action && <div className="vault-credential-action">{action}</div>}
    </div>
  )
}

export async function copyCredential(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  } catch {
    toast.error("Clipboard unavailable")
  }
}

export function LoginActions({
  onEdit,
  onRefreshIcon,
  onCopyUsername,
  onCopyPassword,
  onDelete,
}: {
  onEdit?: () => void
  onRefreshIcon?: () => void
  onCopyUsername?: () => void
  onCopyPassword?: () => void
  onDelete?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Login actions" />
        }
      >
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil /> Edit login
          </DropdownMenuItem>
        )}
        {onRefreshIcon && (
          <DropdownMenuItem onClick={onRefreshIcon}>
            <RefreshCw /> Refetch favicon
          </DropdownMenuItem>
        )}
        {onCopyUsername && (
          <DropdownMenuItem onClick={onCopyUsername}>
            <Copy /> Copy username
          </DropdownMenuItem>
        )}
        {onCopyPassword && (
          <DropdownMenuItem onClick={onCopyPassword}>
            <Copy /> Copy password
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> Delete login
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
