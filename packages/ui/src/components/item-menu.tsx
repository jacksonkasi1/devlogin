import {
  Plus,
  KeyRound,
  CreditCard,
  Contact,
  Code,
  NotebookPen,
  FileText,
  Landmark,
  Wallet,
  Database,
  IdCard,
  Mail,
  HeartPulse,
  BadgeCheck,
  Trees,
  BookUser,
  LockKeyhole,
  Gift,
  Server,
  Fingerprint,
  AppWindow,
  Terminal,
  Router,
} from "lucide-react"
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

const icons = {
  card: CreditCard,
  profile: Contact,
  api: Code,
  note: NotebookPen,
  document: FileText,
  bank: Landmark,
  wallet: Wallet,
  database: Database,
  driver: IdCard,
  email: Mail,
  medical: HeartPulse,
  membership: BadgeCheck,
  outdoor: Trees,
  passport: BookUser,
  password: LockKeyhole,
  reward: Gift,
  server: Server,
  ssn: Fingerprint,
  software: AppWindow,
  ssh: Terminal,
  router: Router,
}
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
          <DropdownMenuItem onClick={onLogin}>
            <KeyRound className="text-blue-500" /> Login
          </DropdownMenuItem>
        )}
        {personalKinds.map((kind) => {
          const Icon = icons[kind]
          return (
            <DropdownMenuItem key={kind} onClick={() => onCategory(kind)}>
              <Icon className="text-blue-500" /> {categoryNames[kind]}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
