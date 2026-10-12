import type {
  Project,
  Account,
  Preference,
  Sync,
  User,
} from "@workspace/shared"
import type { PageIdentity } from "./local-identity"
import type { UiSettings } from "./ui-settings"
export type Message =
  | { type: "identify-local"; projectId: string }
  | { type: "ui-settings"; settings: Partial<UiSettings> }
  | { type: "login" }
  | { type: "logout" }
  | { type: "snapshot" }
  | { type: "configure"; origin: string }
  | { type: "api"; path: string; method?: string; body?: unknown }
  | { type: "manual"; accountId: string; submit: boolean }
  | { type: "open-fill"; accountId: string; submit: boolean }
  | { type: "context" }
  | { type: "automatic"; projectId: string; accountId: string }
  | { type: "page" }
  | { type: "suggest-fill"; accountId: string }
  | {
      type: "observe"
      email: string
      password: string
      kind: "login" | "change" | "signup"
    }
  | { type: "pending" }
  | {
      type: "confirm"
      id: string
      accountId?: string
      label?: string
      projectName?: string
      projectId?: string | null
      mode?: "new" | "update"
    }
  | { type: "dismiss"; id: string }
  | { type: "manage" }
  | { type: "permissions-changed" }
  | { type: "exclude"; origin: string; excluded: boolean }
export type Context = {
  project: Project
  account: Account
  preference: Preference
} | null
export type Snapshot = {
  matchedProjectId: string | null
  settings: UiSettings
  user: User | null
  data: Sync | null
  origin: string
  tabUrl: string
  tabId?: number
  monitoring?: boolean
  excluded?: string[]
}
export type PageContext = {
  settings: UiSettings
  project: Project | null
  accounts: Account[]
  admin: boolean
}
export type Pending = {
  projects?: Project[]
  id: string
  project: Project | null
  website: string
  email: string
  matches: Account[]
  kind: "login" | "change" | "signup"
  expires: number
}
export type Fill = {
  type: "fill"
  project: Project
  account: Account
  password: string
  submit: boolean
  automatic?: boolean
  submitIfValid?: boolean
  identity?: PageIdentity
}
export type Reply<T> =
  { ok: true; data: T } | { ok: false; error: string; status?: number }

export type View =
  | "home"
  | "projects"
  | "accounts"
  | "project-edit"
  | "account-edit"
  | "settings"
