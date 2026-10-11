import { accountTone } from "./account-tone"
import { useState } from "react"
import type { Account } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"
import { AccountSecret } from "@workspace/ui/components/account-secret"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import { toast } from "@workspace/ui/components/sonner"
import { send } from "./client"

export function AccountList({
  accounts,
  admin,
  busy,
  onLogin,
  onEdit,
  onDelete,
  onAdd,
}: {
  accounts: Account[]
  admin: boolean
  busy: boolean
  onLogin: (account: Account, submit: boolean) => void
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
  onAdd: () => void
}) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const account = accounts.find((item) => item.id === selected)
  return (
    <div className="space-y-3">
      <Input
        aria-label="Search accounts"
        placeholder="Search accounts…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="flex justify-between text-sm">
        <span className="font-medium">Available accounts</span>
        <span className="text-muted-foreground">{accounts.length} saved</span>
      </div>
      <div className="divide-y overflow-hidden rounded-xl border">
        {accounts
          .filter((item) =>
            `${item.label} ${item.email}`
              .toLowerCase()
              .includes(search.toLowerCase())
          )
          .map((item) => (
            <div className="flex items-center gap-2 p-3" key={item.id}>
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => setSelected(item.id)}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg font-medium ${accountTone(item).classes}`}
                >
                  {item.label[0]?.toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {item.label}{" "}
                    {item.is_default && (
                      <Badge variant="secondary">Default</Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.email}
                  </span>
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Actions for ${item.label}`}
                    />
                  }
                >
                  ⋯
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSelected(item.id)}>
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onLogin(item, false)}>
                    Fill login
                  </DropdownMenuItem>
                  {admin && (
                    <>
                      <DropdownMenuItem onClick={() => onEdit(item)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(item)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
      </div>
      {!accounts.length && (
        <p className="text-sm text-muted-foreground">No saved accounts yet.</p>
      )}
      {admin && (
        <Button className="w-full" variant="outline" onClick={onAdd}>
          ＋ Add login
        </Button>
      )}
      <Dialog
        open={!!account}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{account?.label}</DialogTitle>
            <DialogDescription>
              {account?.environment
                ? new URL(account.environment).host
                : "All project websites"}
            </DialogDescription>
          </DialogHeader>
          {account && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm break-all">{account.email}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void navigator.clipboard.writeText(account.email).then(
                      () => toast.success("Email copied"),
                      () => toast.error("Clipboard unavailable")
                    )
                  }
                >
                  Copy email
                </Button>
              </div>
              {account.login_type === "password" && (
                <AccountSecret
                  reveal={async () =>
                    (
                      await send<{ password: string }>({
                        type: "api",
                        path: `/api/accounts/${account.id}/password`,
                        method: "POST",
                        body: {},
                      })
                    ).password
                  }
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => onLogin(account, false)}>
                  Fill login
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => onLogin(account, true)}
                >
                  {account.login_type === "google"
                    ? "Google sign-in"
                    : "Fill and submit"}
                </Button>
              </div>
              {admin && (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelected(null)
                      onEdit(account)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelected(null)
                      onDelete(account)
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
