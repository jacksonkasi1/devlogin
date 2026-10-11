import { z } from "zod"

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
  created_at: string
  updated_at: string
}
export type Project = z.infer<typeof projectSchema> & {
  id: string
  created_at: string
  updated_at: string
}
export type Account = Omit<z.infer<typeof accountSchema>, "password"> & {
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
