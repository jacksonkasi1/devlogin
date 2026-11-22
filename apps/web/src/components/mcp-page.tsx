import { useEffect, useState } from "react"
import { apiRequest, type User } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/ui/components/card"
import { toast } from "@workspace/ui/components/sonner"

type Info = { token: string; url: string }
const api = <T,>(path: string, options?: RequestInit) =>
  apiRequest<T>("", path, options)

function snippets({ token, url }: Info) {
  const header = `Authorization: Bearer ${token}`
  return [
    {
      name: "Claude Code",
      hint: "Run in your terminal",
      code: `claude mcp add --transport http --scope user devlogin ${url} --header "${header}"`,
    },
    {
      name: "Codex",
      hint: "Add to ~/.codex/config.toml",
      code: `[mcp_servers.devlogin]\nurl = "${url}"\nhttp_headers = { "Authorization" = "Bearer ${token}" }`,
    },
    {
      name: "OpenCode",
      hint: "Add to opencode.json (see opencode.ai/docs/mcp-servers)",
      code: JSON.stringify(
        {
          $schema: "https://opencode.ai/config.json",
          mcp: {
            servers: {
              devlogin: {
                type: "remote",
                url,
                oauth: false,
                headers: { Authorization: `Bearer ${token}` },
              },
            },
          },
        },
        null,
        2
      ),
    },
    {
      name: "Cursor",
      hint: "Add to ~/.cursor/mcp.json",
      code: JSON.stringify(
        {
          mcpServers: {
            devlogin: { url, headers: { Authorization: `Bearer ${token}` } },
          },
        },
        null,
        2
      ),
    },
    {
      name: "VS Code",
      hint: "Add to .vscode/mcp.json",
      code: JSON.stringify(
        {
          servers: {
            devlogin: {
              type: "http",
              url,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2
      ),
    },
    {
      name: "Claude Desktop",
      hint: "Add to claude_desktop_config.json (uses npx mcp-remote)",
      code: JSON.stringify(
        {
          mcpServers: {
            devlogin: {
              command: "npx",
              args: [
                "-y",
                "mcp-remote",
                url,
                "--header",
                "Authorization:${AUTH_HEADER}",
              ],
              env: { AUTH_HEADER: `Bearer ${token}` },
            },
          },
        },
        null,
        2
      ),
    },
  ]
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  } catch {
    toast.error("Clipboard unavailable")
  }
}

export function McpPage({ user }: { user: User }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => {
    api<Info>("/api/mcp/token", { method: "POST", body: "{}" })
      .then(setInfo)
      .catch((failure) =>
        toast.error(
          failure instanceof Error ? failure.message : "Could not load MCP"
        )
      )
  }, [])
  async function reset() {
    setBusy(true)
    try {
      setInfo(
        await api<Info>("/api/mcp/token/reset", { method: "POST", body: "{}" })
      )
      setConfirmReset(false)
      toast.success("New MCP token generated. Update your clients.")
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Reset failed")
    } finally {
      setBusy(false)
    }
  }
  const editing = user.is_admin || user.can_edit
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>MCP access</CardTitle>
          <CardDescription>
            Connect Claude, Codex, OpenCode and other AI tools to Global Login. They
            can browse, add, rename, edit, move and delete projects and logins
            (including emoji icons, notes and passwords), and use backups.{" "}
            {editing
              ? "Your account can edit, so tools using this token can too."
              : "Your account is view-only, so tools using this token can read but not change anything."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Server URL
            </p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-sm">
                {info?.url ?? "…"}
              </code>
              <Button
                variant="outline"
                disabled={!info}
                onClick={() => info && void copy(info.url, "URL")}
              >
                Copy
              </Button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Your personal token. Treat it like a password.
            </p>
            <div className="flex flex-wrap gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-sm">
                {info ? (reveal ? info.token : "•".repeat(24)) : "…"}
              </code>
              <Button variant="outline" onClick={() => setReveal(!reveal)}>
                {reveal ? "Hide" : "Show"}
              </Button>
              <Button
                variant="outline"
                disabled={!info}
                onClick={() => info && void copy(info.token, "Token")}
              >
                Copy
              </Button>
              {confirmReset ? (
                <>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void reset()}
                  >
                    Confirm reset
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmReset(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setConfirmReset(true)}>
                  Reset token
                </Button>
              )}
            </div>
            {confirmReset && (
              <p className="mt-1 text-xs text-muted-foreground">
                The old token stops working immediately.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      {info &&
        snippets(info).map((item) => (
          <Card key={item.name}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>{item.hint}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copy(item.code, `${item.name} setup`)}
                >
                  Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs break-all whitespace-pre-wrap">
                {item.code.replace(
                  info.token,
                  reveal ? info.token : "<your-token: press Show or Copy>"
                )}
              </pre>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}
