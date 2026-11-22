import {
  generatePassword,
  personalFields,
  personalKinds,
} from "@workspace/shared"
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
const tags = {
  type: "array",
  items: str("Tag"),
  description: "Organization tags. Send [] to clear.",
}
const icon = str(
  "An emoji, a built-in icon name (folder, key, terminal, globe, code, database), or an empty string for the automatic icon."
)
const loginFields = {
  tags,
  environment: str("Legacy project website origin, or empty for every website"),
  label: str("Display name of the login, e.g. 'Admin' or 'QA user'"),
  email: str("Username or email used to sign in"),
  password: str("Password. Omit on update to keep the current one"),
  login_type: { type: "string", enum: ["password", "google"] },
  icon,
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
  icon,
  tags,
  urls: { type: "array", items: str("Project website URL") },
  login_path: website.properties.login_path,
  selectors: website.properties.selectors,
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
      tag: str("Exact tag, case insensitive"),
    }),
    annotations: { readOnlyHint: true },
    run: async (input, api) => {
      const path = input.project_id
        ? `/api/accounts?project_id=${encodeURIComponent(String(input.project_id))}`
        : "/api/accounts"
      const rows = (await api<Row[]>(path)).filter(
        (row) =>
          !input.tag ||
          (Array.isArray(row.tags) &&
            row.tags.some(
              (t) => String(t).toLowerCase() === String(input.tag).toLowerCase()
            ))
      )
      const query = String(input.query ?? "").toLowerCase()
      return query
        ? rows.filter((row) =>
            JSON.stringify([
              row.label,
              row.email,
              row.notes,
              row.websites,
              row.tags,
            ])
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
    name: "refetch_favicons",
    description:
      "Rediscover website icons for one login (id) or every automatic icon. Repeat with after set to next until next is null. Custom icons are preserved.",
    inputSchema: obj({
      id: str("Optional login id"),
      after: str("Continuation cursor from next"),
    }),
    run: (input, api) => api("/api/favicons/refresh", "POST", input),
  },
  {
    name: "list_preferences",
    description: "List your per-project autofill preferences.",
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    run: (_, api) => api("/api/preferences"),
  },
  {
    name: "set_preference",
    description:
      "Set your selected login and auto-login preference for a project.",
    inputSchema: obj(
      {
        project_id: str("Project id"),
        account_id: { type: ["string", "null"] },
        auto_login: { type: "boolean" },
      },
      ["project_id", "account_id", "auto_login"]
    ),
    run: (input, api) => api("/api/preferences", "PUT", input),
  },
  {
    name: "list_members",
    description: "List workspace members and access settings. Admin only.",
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    run: (_, api) => api("/api/users"),
  },
  {
    name: "update_member",
    description: "Change member approval or privileges. Admin only.",
    inputSchema: obj(
      {
        id: str("Member id"),
        approved: { type: "boolean" },
        can_edit: { type: "boolean" },
        can_backup: { type: "boolean" },
        is_admin: { type: "boolean" },
      },
      ["id"]
    ),
    run: (input, api) =>
      api(
        "/api/users/" + encodeURIComponent(text(input, "id")),
        "PATCH",
        pick(input, ["approved", "can_edit", "can_backup", "is_admin"])
      ),
  },
  {
    name: "edit_items",
    description:
      "Apply up to 10 login or project updates in order. Each item needs id and changed fields. Stops at the first failure and returns its index and completed IDs. Use to rename, tag, move, or change icons.",
    inputSchema: obj(
      {
        edits: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: {
            oneOf: [
              obj(
                {
                  type: { const: "login" },
                  id: str("Login id"),
                  project_id: str("Destination project"),
                  ...loginFields,
                },
                ["type", "id"]
              ),
              obj(
                {
                  type: { const: "project" },
                  id: str("Project id"),
                  ...projectFields,
                },
                ["type", "id"]
              ),
            ],
          },
        },
      },
      ["edits"]
    ),
    run: async (input, api) => {
      if (
        !Array.isArray(input.edits) ||
        !input.edits.length ||
        input.edits.length > 10
      )
        throw new Error("Provide 1–10 edits")
      const completed: string[] = []
      for (const edit of input.edits) {
        try {
          if (edit?.type !== "project" && edit?.type !== "login")
            throw new Error("Unknown item type")
          const tool = tools.find((t) => t.name === "update_" + edit.type)!
          await tool.run(edit, api)
          completed.push(edit.id)
        } catch (error) {
          return {
            completed,
            failed_index: completed.length,
            error: error instanceof Error ? error.message : "Update failed",
          }
        }
      }
      return { completed }
    },
  },
  {
    name: "list_collections",
    description:
      "List named groups and their membership tags. Tag a project or login to include it.",
    inputSchema: obj({}),
    run: (_, api) => api("/api/collections"),
  },
  {
    name: "save_collection",
    description:
      "Create or edit a named collection of logins matching a tag across projects.",
    inputSchema: obj(
      {
        id: str("Existing collection id"),
        name: str("Collection name"),
        tag: str("Membership tag"),
        project_id: str("Optional project scope"),
      },
      ["name", "tag"]
    ),
    run: (i, api) =>
      api(
        "/api/collections" +
          (i.id ? "/" + encodeURIComponent(text(i, "id")) : ""),
        i.id ? "PUT" : "POST",
        pick(i, ["name", "tag", "project_id"])
      ),
  },
  {
    name: "delete_collection",
    description: "Delete a collection view and retain its logins.",
    inputSchema: obj({ id: str("Collection id") }, ["id"]),
    annotations: { destructiveHint: true },
    run: (i, api) =>
      api("/api/collections/" + encodeURIComponent(text(i, "id")), "DELETE"),
  },
  {
    name: "login_activity",
    description:
      "See a login's creator, recent editors, timestamps and changed field names.",
    inputSchema: obj({ id: str("Login id") }, ["id"]),
    annotations: { readOnlyHint: true },
    run: (i, api) => api("/api/activity/" + encodeURIComponent(text(i, "id"))),
  },
  {
    name: "list_files",
    description: "List your private R2 attachments.",
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    run: (_, api) => api("/api/files"),
  },
  {
    name: "upload_text_file",
    description:
      "Upload a small private text or JSON attachment. For binary files and files up to 50 MB use File attachments.",
    inputSchema: obj(
      {
        name: str("Filename"),
        text: str("File contents, maximum 64000 characters"),
        account_id: str("Optional login id"),
      },
      ["name", "text"]
    ),
    run: (input, api) => api("/api/files/text", "POST", input),
  },
  {
    name: "set_file_login",
    description:
      "Attach your private file to a login. Omit account_id to detach it.",
    inputSchema: obj({ id: str("File id"), account_id: str("Login id") }, [
      "id",
    ]),
    run: (input, api) =>
      api("/api/files/" + encodeURIComponent(text(input, "id")), "PATCH", {
        account_id: input.account_id ? text(input, "account_id") : null,
      }),
  },
  {
    name: "rename_file",
    description: "Rename your attachment.",
    inputSchema: obj({ id: str("File id"), name: str("New filename") }, [
      "id",
      "name",
    ]),
    run: (input, api) =>
      api("/api/files/" + encodeURIComponent(text(input, "id")), "PATCH", {
        name: text(input, "name"),
      }),
  },
  {
    name: "delete_file",
    description: "Permanently delete your attachment.",
    inputSchema: obj({ id: str("File id") }, ["id"]),
    annotations: { destructiveHint: true },
    run: (input, api) =>
      api("/api/files/" + encodeURIComponent(text(input, "id")), "DELETE"),
  },
  {
    name: "list_personal_items",
    description:
      "List your private profile, card and secure-note titles and tags.",
    inputSchema: obj({}),
    annotations: { readOnlyHint: true },
    run: (_, api) => api("/api/personal-items"),
  },
  {
    name: "get_personal_item",
    description: "Read your selected private item including sensitive fields.",
    inputSchema: obj({ id: str("Item id") }, ["id"]),
    annotations: { readOnlyHint: true },
    run: (input, api) =>
      api("/api/personal-items/" + encodeURIComponent(text(input, "id"))),
  },
  {
    name: "save_personal_item",
    description:
      "Create a private profile, card, or secure note. Include id for partial edits. Fields by kind: " +
      JSON.stringify(personalFields),
    inputSchema: obj({
      id: str("Existing item id"),
      kind: { enum: personalKinds },
      title: str("Display name"),
      icon,
      tags,
      fields: { type: "object", additionalProperties: { type: "string" } },
    }),
    run: async (input, api) => {
      const path =
        "/api/personal-items" +
        (input.id ? "/" + encodeURIComponent(text(input, "id")) : "")
      const current = input.id ? await api<Json>(path) : {}
      return api(path, input.id ? "PUT" : "POST", {
        ...pick(current, ["kind", "title", "icon", "tags"]),
        ...pick(input, ["kind", "title", "icon", "tags"]),
        fields: { ...(current.fields as Json), ...(input.fields as Json) },
      })
    },
  },
  {
    name: "delete_personal_item",
    description: "Delete your private item.",
    inputSchema: obj({ id: str("Item id") }, ["id"]),
    annotations: { destructiveHint: true },
    run: (input, api) =>
      api(
        "/api/personal-items/" + encodeURIComponent(text(input, "id")),
        "DELETE"
      ),
  },
  {
    name: "generate_password",
    description: "Generate a strong random password (nothing is saved).",
    inputSchema: obj({
      length: { type: "number", description: "16-128, default 24" },
    }),
    annotations: { readOnlyHint: true },
    run: async (input) => {
      return { password: generatePassword(Number(input.length)) }
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
            "Global Login shared credential vault. Use list_projects/list_logins to browse, get_login for a password, and create/update/delete tools to manage logins. Your access rights are the same as your Global Login account.",
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
