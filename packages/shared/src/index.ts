import { z } from "zod"

// Share favicon selection between the dashboard, popup and in-page suggestions.
// Never send paths, queries or local hostnames to the public fallback service.
let iconBackend = "https://devlogin.peacockindia.in"
export function configureIconBackend(origin: string) {
  iconBackend = new URL(origin).origin
}
export function websiteFavicons(website?: string): string[] {
  if (!website) return []
  try {
    const url = new URL(website)
    if (!["https:", "http:"].includes(url.protocol)) return []
    const direct = new URL("/favicon.ico", url.origin).href
    const local =
      !url.hostname.includes(".") ||
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(
        url.hostname
      ) ||
      /\.(localhost|local|internal)$/.test(url.hostname)
    return local
      ? [direct]
      : [
          `${iconBackend}/api/favicon?url=${encodeURIComponent(url.origin)}`,
          `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`,
          direct,
        ]
  } catch {
    return []
  }
}

export type WebsiteIcon = { origin: string; url: string; revision: string }
export const tagsSchema = z
  .array(z.string().trim().min(1).max(48))
  .max(32)
  .transform((tags) => [
    ...new Map(tags.map((tag) => [tag.toLowerCase(), tag])).values(),
  ])
  .optional()

export type RefreshPage = {
  refreshed: number
  skipped: number
  next: string | null
}
export async function refreshWebsiteIcons(
  request: (body: { id?: string; after?: string }) => Promise<RefreshPage>,
  id?: string
) {
  let after: string | undefined
  let refreshed = 0,
    skipped = 0
  do {
    const page = await request({ id, after })
    refreshed += page.refreshed
    skipped += page.skipped
    after = page.next ?? undefined
  } while (after)
  return `Refreshed ${refreshed} website icons${skipped ? `, ${skipped} unavailable` : ""}`
}

const applicationUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const u = new URL(value)
      return (
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        (u.protocol === "https:" ||
          (u.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))
      )
    } catch {
      return false
    }
  }, "Use HTTPS, or HTTP on localhost; omit query, fragment and credentials")
export const selectorsSchema = z.object({
  email: z.string().max(500).default(""),
  password: z.string().max(500).default(""),
  submit: z.string().max(500).default(""),
  google: z.string().max(500).default(""),
})
export const projectSchema = z.object({
  tags: tagsSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(""),
  icon: z.string().max(32).optional(),
  urls: z.array(applicationUrl).max(100).default([]),
  login_path: z
    .string()
    .max(500)
    .regex(/^\/(?!\/)[^?#]*$/)
    .default("/login"),
  selectors: selectorsSchema.default({
    email: "",
    password: "",
    submit: "",
    google: "",
  }),
})
export function normalizeWebsite(value: string) {
  const url = new URL(value.trim())
  url.search = ""
  url.hash = ""
  return url.href
}
const websiteUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value)
    return (
      !url.username &&
      !url.password &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    )
  }, "Use HTTPS, or HTTP on localhost; omit credentials")
  .transform(normalizeWebsite)
export const websiteSchema = z.object({
  url: websiteUrl,
  login_path: z
    .string()
    .max(500)
    .regex(/^\/(?!\/)[^?#]*$/)
    .optional(),
  selectors: selectorsSchema.optional(),
})
export type Website = z.infer<typeof websiteSchema>
export const accountSchema = z.object({
  tags: tagsSchema,
  project_id: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  icon: z.string().max(32).optional(),
  notes: z.string().max(10000).optional(),
  websites: z.array(websiteSchema).max(100).optional(),
  email: z.string().trim().min(1).max(254),
  environment: z.union([applicationUrl, z.literal("")]).default(""),
  password: z.string().min(1).max(4096).optional(),
  login_type: z.enum(["password", "google"]),
  is_default: z.boolean().default(false),
})
export const preferenceSchema = z.object({
  project_id: z.string().min(1),
  account_id: z.string().nullable(),
  auto_login: z.boolean(),
})
export const submissionSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().min(1).max(4096),
  kind: z.enum(["login", "change", "signup"]),
})
export type User = {
  id: string
  google_id: string
  email: string
  name: string
  avatar_url: string | null
  approved: boolean
  is_admin: boolean
  can_edit: boolean
  can_backup: boolean
  created_at: string
  updated_at: string
}
export type Project = z.infer<typeof projectSchema> & {
  id: string
  created_at: string
  updated_at: string
}
export type Account = Omit<z.infer<typeof accountSchema>, "password"> & {
  favicon?: WebsiteIcon | null
  id: string
  created_at: string
  updated_at: string
}
export function websiteMatches(website: Website, address: string) {
  try {
    const current = new URL(address),
      configured = new URL(website.url)
    const path = configured.pathname.replace(/\/$/, "")
    return (
      current.origin === configured.origin &&
      (!path ||
        current.pathname === path ||
        current.pathname.startsWith(path + "/"))
    )
  } catch {
    return false
  }
}
export function accountWebsites(
  account: Account,
  project?: Project
): Website[] {
  if (account.websites != null) return account.websites
  return (
    account.environment ? [account.environment] : (project?.urls ?? [])
  ).map((url) => ({
    url,
    login_path: project?.login_path,
    selectors: project?.selectors,
  }))
}
export function accountMatches(account: Account, address: string) {
  if (account.websites != null)
    return account.websites.some((site) => websiteMatches(site, address))
  try {
    return (
      !account.environment ||
      new URL(account.environment).origin === new URL(address).origin
    )
  } catch {
    return false
  }
}
export function accountProject(
  project: Project,
  account: Account,
  address?: string
): Project {
  const sites = accountWebsites(account, project)
  const site =
    sites
      .filter((site) => address && websiteMatches(site, address))
      .sort(
        (a, b) =>
          new URL(b.url).pathname.length - new URL(a.url).pathname.length
      )[0] ?? sites[0]
  return {
    ...project,
    urls: sites.map((site) => site.url),
    login_path: site?.login_path ?? "",
    selectors: site?.selectors ?? {
      email: "",
      password: "",
      submit: "",
      google: "",
    },
  }
}
export function siteProjects(data: Sync, address?: string): Project[] {
  return data.projects.map((project) => {
    const items = data.accounts.filter((a) => a.project_id === project.id)
    const sites = items.flatMap((a) => accountWebsites(a, project))
    const site =
      sites
        .filter((site) => address && websiteMatches(site, address))
        .sort(
          (a, b) =>
            new URL(b.url).pathname.length - new URL(a.url).pathname.length
        )[0] ?? sites[0]
    return {
      ...project,
      urls: [...new Set(sites.map((site) => site.url))],
      login_path: site?.login_path ?? "",
      selectors: site?.selectors ?? project.selectors,
    }
  })
}
export type Preference = z.infer<typeof preferenceSchema>
export type Sync = {
  collections?: Collection[]
  projects: Project[]
  accounts: Account[]
  preferences: Preference[]
  revision: string
}
export function matchProject(
  projects: Project[],
  address: string
): Project | undefined {
  let current: URL
  try {
    current = new URL(address)
  } catch {
    return
  }
  return projects
    .flatMap((project) =>
      project.urls.flatMap((value) => {
        const base = new URL(value)
        const path = base.pathname.replace(/\/$/, "")
        return current.origin === base.origin &&
          (current.pathname === path || current.pathname.startsWith(path + "/"))
          ? [{ project, length: path.length }]
          : []
      })
    )
    .sort((a, b) => b.length - a.length)[0]?.project
}
export function isLoginPage(project: Project, address: string): boolean {
  if (!project.login_path) return !!matchProject([project], address)
  try {
    const url = new URL(address)
    return project.urls.some((value) => {
      const base = new URL(value)
      return (
        base.origin === url.origin &&
        url.pathname.replace(/\/$/, "") ===
          new URL(project.login_path, base).pathname.replace(/\/$/, "")
      )
    })
  } catch {
    return false
  }
}
export function loginUrl(project: Project, environment = project.urls[0]!) {
  return project.login_path
    ? new URL(project.login_path, environment).href
    : environment
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
export async function apiRequest<T>(
  base: string,
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: token ? "omit" : "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(20_000),
  })
  const data = (await response.json()) as T & { error?: string }
  if (!response.ok)
    throw new ApiError(data.error ?? "Request failed", response.status)
  return data
}

export const personalKinds = [
  "card",
  "profile",
  "api",
  "note",
  "document",
  "bank",
  "wallet",
  "database",
  "driver",
  "email",
  "medical",
  "membership",
  "outdoor",
  "passport",
  "password",
  "reward",
  "server",
  "ssn",
  "software",
  "ssh",
  "router",
] as const
export const categoryNames = {
  card: "Credit Card",
  profile: "Identity",
  api: "API Credential",
  note: "Secure Note",
  document: "Document",
  bank: "Bank Account",
  wallet: "Crypto Wallet",
  database: "Database",
  driver: "Driver License",
  email: "Email Account",
  medical: "Medical Record",
  membership: "Membership",
  outdoor: "Outdoor License",
  passport: "Passport",
  password: "Password",
  reward: "Reward Program",
  server: "Server",
  ssn: "Social Security Number",
  software: "Software License",
  ssh: "SSH Key",
  router: "Wireless Router",
}
export type PersonalKind = (typeof personalKinds)[number]
export const personalFields: Record<PersonalKind, Record<string, string>> = {
  profile: {
    name: "Full name",
    "given-name": "First name",
    "family-name": "Last name",
    email: "Email",
    tel: "Phone",
    "street-address": "Street address",
    "address-level2": "City",
    "address-level1": "State / region",
    "postal-code": "Postal code",
    "country-name": "Country",
    organization: "Organization",
  },
  card: {
    "cc-name": "Name on card",
    "cc-number": "Card number",
    "cc-exp": "Expiry (MM/YY)",
  },
  note: { content: "Secure note" },
  api: {
    service: "Service",
    username: "Username",
    token: "API key",
    url: "Endpoint",
  },
  document: {
    filename: "Filename",
    attachment: "Attachment",
    content: "Notes",
  },
  bank: {
    bank: "Bank",
    holder: "Account holder",
    number: "Account number",
    routing: "Routing / SWIFT",
  },
  wallet: { network: "Network", address: "Wallet address", notes: "Notes" },
  database: {
    host: "Host",
    database: "Database name",
    username: "Username",
    password: "Password",
    port: "Port",
  },
  driver: {
    name: "Name",
    number: "License number",
    issuer: "Issuing authority",
    expires: "Expiry",
  },
  email: { email: "Email", password: "Password", host: "Mail server" },
  medical: { provider: "Provider", record: "Record" },
  membership: {
    organization: "Organization",
    member: "Member number",
    expires: "Expiry",
  },
  outdoor: { license: "License number", issuer: "Issuer", expires: "Expiry" },
  passport: {
    number: "Passport number",
    name: "Name",
    country: "Country",
    expires: "Expiry",
  },
  password: { password: "Password", url: "Website" },
  reward: { program: "Program", member: "Member number" },
  server: {
    host: "Host",
    username: "Username",
    password: "Password",
    port: "Port",
  },
  ssn: { name: "Name", number: "Number" },
  software: {
    product: "Product",
    key: "License key",
    email: "Registered email",
  },
  ssh: {
    public: "Public key",
    private: "Private key",
    passphrase: "Passphrase",
  },
  router: {
    ssid: "Network name",
    password: "Wireless password",
    address: "Router address",
  },
}
export const personalSchema = z
  .object({
    kind: z.enum(personalKinds),
    title: z.string().trim().min(1).max(120),
    icon: z.string().max(32).default(""),
    tags: tagsSchema,
    fields: z.record(z.string(), z.string().max(32000)),
  })
  .strict()
  .refine(
    (item) =>
      Object.keys(item.fields).every((key) =>
        Object.hasOwn(personalFields[item.kind], key)
      ),
    "Unknown field for this item"
  )
export type PersonalItem = z.infer<typeof personalSchema> & { id: string }
export type PersonalSummary = Omit<PersonalItem, "fields">

export function generatePassword(length = 24) {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_"
  const size = Math.min(128, Math.max(16, Math.floor(length) || 24))
  const limit = 256 - (256 % alphabet.length)
  let password = ""
  while (password.length < size)
    for (const value of crypto.getRandomValues(new Uint8Array(size))) {
      if (value < limit && password.length < size)
        password += alphabet[value % alphabet.length]
    }
  return password
}
export type Collection = {
  project_id?: string | null
  id: string
  name: string
  tag: string
}
export function groupsFor(
  account: Account,
  project: Project | undefined,
  groups: Collection[] = []
) {
  const tags = new Set(
    [...(account.tags ?? []), ...(project?.tags ?? [])].map((s) =>
      s.toLowerCase()
    )
  )
  return groups.filter(
    (g) =>
      (!g.project_id || g.project_id === account.project_id) &&
      tags.has(g.tag.toLowerCase())
  )
}
export type SortOrder = "priority" | "newest" | "oldest" | "updated" | "name"
export function orderLogins(
  items: Account[],
  order: SortOrder,
  score: (a: Account) => number = () => 0
) {
  return [...items].sort((a, b) => {
    if (order === "priority") {
      const diff =
        score(b) - score(a) || Number(b.is_default) - Number(a.is_default)
      if (diff) return diff
    }
    if (order === "updated")
      return (
        b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)
      )
    if (order === "newest" || order === "oldest")
      return (
        (order === "newest" ? -1 : 1) *
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
      )
    return a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
  })
}
