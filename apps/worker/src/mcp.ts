import { Hono } from "hono"
import type { AppEnv } from "./auth"

// Stateless MCP (Streamable HTTP) server. Every tool is a thin wrapper around the
// regular REST API, called with the caller's own token, so validation, encryption
// and role checks (view-only vs edit, backup access) are enforced in exactly one place.
type Call = (request: Request) => Promise<Response>
type Json = Record<string, unknown>
type Tool = {
  name: string
  description: string
  inputSchema: Json
  run: (input: Json, api: Api) => Promise<unknown>
  annotations?: Json
}
type Api = <T = unknown>(
  path: string,
  method?: string,
  body?: unknown
) => Promise<T>

const str = (description: string) => ({ type: "string", description })
const obj = (properties: Json, required: string[] = []): Json => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
})
const website = {
  type: "object",
  properties: {
    url: str("Website URL (HTTPS, or HTTP on localhost)"),
    login_path: str("Login page path such as /login"),
    selectors: {
      type: "object",
      description: "Optional CSS selectors: email, password, submit, google",
      properties: {
        email: { type: "string" },
        password: { type: "string" },
        submit: { type: "string" },
        google: { type: "string" },
      },
    },
  },
  required: ["url"],
}
const loginFields = {
  label: str("Display name of the login, e.g. 'Admin' or 'QA user'"),
  email: str("Username or email used to sign in"),
  password: str("Password. Omit on update to keep the current one"),
  login_type: { type: "string", enum: ["password", "google"] },
  icon: str("Emoji used as the login icon, e.g. 🔑"),
  notes: str("Free-form notes"),
  websites: {
    type: "array",
    description: "Websites this login works on",
    items: website,
  },
  is_default: {
    type: "boolean",
    description: "Make this the default login of its project",
  },
}
const projectFields = {
  name: str("Project name"),
  description: str("Project description"),
  icon: str("Emoji used as the project icon"),
}
const pick = (input: Json, keys: string[]) =>
  Object.fromEntries(
    keys.filter((key) => input[key] !== undefined).map((k) => [k, input[k]])
  )
const text = (input: Json, key: string) => {
  const value = input[key]
  if (typeof value !== "string" || !value) throw new Error(`${key} is required`)
  return value
}

type Row = Json & { id: string }
const tools: Tool[] = [
  {
    name: "list_projects",
    description:
      "List all projects (folders that group logins) with their websites.",
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    run: (_input, api) => api("/api/projects"),
  },
  {
    name: "list_logins",
    description:
      "List saved logins (no passwords). Filter by project and/or a search text matching label, username, notes or website.",
    inputSchema: obj({
      project_id: str("Only logins of this project"),
      query: str("Case-insensitive search text"),
    }),
    annotations: { readOnlyHint: true },
    run: async (input, api) => {
      const path = input.project_id
        ? `/api/accounts?project_id=${encodeURIComponent(String(input.project_id))}`
        : "/api/accounts"
      const rows = await api<Row[]>(path)
      const query = String(input.query ?? "").toLowerCase()
      return query
        ? rows.filter((row) =>
            JSON.stringify([row.label, row.email, row.notes, row.websites])
              .toLowerCase()
              .includes(query)
          )
        : rows
    },
  },
  {
    name: "get_login",
    description: "Get one login including its decrypted password.",
    inputSchema: obj({ id: str("Login id") }, ["id"]),
    annotations: { readOnlyHint: true },
    run: async (input, api) => {
      const id = text(input, "id")
      const rows = await api<Row[]>("/api/accounts")
      const login = rows.find((row) => row.id === id)
      if (!login) throw new Error("Login not found")
      const { password } = await api<{ password: string }>(
        `/api/accounts/${encodeURIComponent(id)}/password`,
        "POST",
        {}
      )
      return { ...login, password }
    },
  },
  {
    name: "create_project",
    description: "Create a project (a folder that groups logins).",
    inputSchema: obj(projectFields, ["name"]),
    run: (input, api) =>
      api("/api/projects", "POST", pick(input, Object.keys(projectFields))),
  },
  {
    name: "update_project",
    description: "Rename a project or change its description or emoji icon.",
    inputSchema: obj({ id: str("Project id"), ...projectFields }, ["id"]),
    run: async (input, api) => {
      const id = text(input, "id")
      const current = await api<Row>(`/api/projects/${encodeURIComponent(id)}`)
      return api(`/api/projects/${encodeURIComponent(id)}`, "PUT", {
        ...pick(current, [
          "name",
          "description",
          "icon",
          "urls",
          "login_path",
          "selectors",
        ]),
        ...pick(input, Object.keys(projectFields)),
      })
    },
  },
  {
    name: "delete_project",
    description: "Delete a project and every login inside it. Irreversible.",
    inputSchema: obj({ id: str("Project id") }, ["id"]),
    annotations: { destructiveHint: true },
    run: (input, api) =>
      api(`/api/projects/${encodeURIComponent(text(input, "id"))}`, "DELETE"),
  },
  {
    name: "create_login",
    description:
      "Add a login to a project. Password logins need a password; Google logins do not.",
    inputSchema: obj({ project_id: str("Project id"), ...loginFields }, [
      "project_id",
      "label",
      "email",
      "login_type",
    ]),
    run: (input, api) =>
      api(
        "/api/accounts",
        "POST",
        pick(input, ["project_id", ...Object.keys(loginFields)])
      ),
  },
  {
    name: "update_login",
    description:
      "Change any field of a login: rename, email/username, password, emoji icon, notes, websites, default flag, or move it to another project with project_id.",
    inputSchema: obj(
      {
        id: str("Login id"),
        project_id: str("Move to this project"),
        ...loginFields,
      },
      ["id"]
    ),
    run: async (input, api) => {
      const id = text(input, "id")
      const rows = await api<Row[]>("/api/accounts")
      const current = rows.find((row) => row.id === id)
      if (!current) throw new Error("Login not found")
      return api(`/api/accounts/${encodeURIComponent(id)}`, "PUT", {
        ...pick(current, [
          "project_id",
          "label",
          "icon",
          "notes",
          "websites",
          "email",
          "environment",
          "login_type",
          "is_default",
        ]),
        ...pick(input, ["project_id", ...Object.keys(loginFields)]),
      })
    },
  },
  {
    name: "delete_login",
    description: "Delete a login. Irreversible.",
    inputSchema: obj({ id: str("Login id") }, ["id"]),
    annotations: { destructiveHint: true },
    run: (input, api) =>
      api(`/api/accounts/${encodeURIComponent(text(input, "id"))}`, "DELETE"),
  },
  {
    name: "generate_password",
    description: "Generate a strong random password (nothing is saved).",
    inputSchema: obj({
      length: { type: "number", description: "16-128, default 24" },
    }),
    annotations: { readOnlyHint: true },
    run: async (input) => {
      const length = Math.min(
        128,
        Math.max(16, Math.floor(Number(input.length) || 24))
      )
      const alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_"
      const limit = 256 - (256 % alphabet.length)
      let password = ""
      while (password.length < length)
        for (const byte of crypto.getRandomValues(new Uint8Array(length)))
          if (byte < limit && password.length < length)
            password += alphabet[byte % alphabet.length]
      return { password }
    },
  },
  {
    name: "export_backup",
    description:
      "Export every project and login, including decrypted passwords, as JSON. Requires backup access.",
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    run: (_input, api) => api("/api/backup"),
  },
  {
    name: "import_backup",
    description:
      "Import a backup produced by export_backup. Existing items with the same id are updated, nothing is deleted. Requires backup access and edit access.",
    inputSchema: obj(
      { backup: { type: "object", description: "Backup JSON" } },
      ["backup"]
    ),
    run: (input, api) => api("/api/backup/import", "POST", input.backup),
  },
]

const versions = ["2025-06-18", "2025-03-26", "2024-11-05"]
export function createMcp(
  call: (request: Request, c: unknown) => Promise<Response>
) {
  const mcp = new Hono<AppEnv>()
  mcp.get("/", (c) => c.body(null, 405, { Allow: "POST" }))
  mcp.delete("/", (c) => c.body(null, 405, { Allow: "POST" }))
  mcp.post("/", async (c) => {
    let message: { id?: unknown; method?: string; params?: Json }
    try {
      message = await c.req.json()
    } catch {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        },
        400
      )
    }
    if (Array.isArray(message))
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Batches are not supported" },
        },
        400
      )
    // Notifications and responses carry no id and need no reply.
    if (message.id === undefined) return c.body(null, 202)
    const reply = (result: unknown) =>
      c.json({ jsonrpc: "2.0", id: message.id, result })
    const fail = (code: number, text: string) =>
      c.json({ jsonrpc: "2.0", id: message.id, error: { code, message: text } })
    switch (message.method) {
      case "initialize": {
        const asked = String(message.params?.protocolVersion ?? "")
        return reply({
          protocolVersion: versions.includes(asked) ? asked : versions[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "devlogin", version: "1.0.0" },
          instructions:
            "DevLogin shared credential vault. Use list_projects/list_logins to browse, get_login for a password, and create/update/delete tools to manage logins. Your access rights are the same as your DevLogin account.",
        })
      }
      case "ping":
        return reply({})
      case "tools/list":
        return reply({
          tools: tools.map(({ run: _run, ...tool }) => tool),
        })
      case "tools/call": {
        const tool = tools.find((item) => item.name === message.params?.name)
        if (!tool) return fail(-32602, "Unknown tool")
        const authorization = c.req.header("Authorization") ?? ""
        const api: Api = async (path, method = "GET", body) => {
          const response = await call(
            new Request(new URL(path, c.req.url), {
              method,
              headers: {
                Authorization: authorization,
                "Content-Type": "application/json",
              },
              ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            }),
            c
          )
          const data = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          if (!response.ok)
            throw new Error(data.error ?? `Request failed (${response.status})`)
          return data as never
        }
        try {
          const result = await tool.run(
            (message.params?.arguments as Json | undefined) ?? {},
            api
          )
          return reply({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          })
        } catch (error) {
          return reply({
            isError: true,
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : "Tool failed",
              },
            ],
          })
        }
      }
      default:
        return fail(-32601, "Method not found")
    }
  })
  return mcp
}
