import { Plus } from "lucide-react"
import {
  categoryNames,
  personalKinds,
  type PersonalKind,
} from "@workspace/shared"
import { Button } from "./button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./dropdown-menu"

export function ItemMenu({
  onLogin,
  onCategory,
  compact = false,
}: {
  onLogin?: () => void
  onCategory: (kind: PersonalKind) => void
  compact?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label="Add item" size={compact ? "icon-sm" : "sm"} />
        }
      >
        <Plus />
        {!compact && "Add item"}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-52 overflow-y-auto"
      >
        {onLogin && (
          <DropdownMenuItem onClick={onLogin}>🔑 Login</DropdownMenuItem>
        )}
        {personalKinds.map((kind) => (
          <DropdownMenuItem key={kind} onClick={() => onCategory(kind)}>
            {categoryNames[kind]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
