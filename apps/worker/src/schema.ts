import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"
import type { Project, Website, WebsiteIcon } from "@workspace/shared"
const timestamps = {
  created_at: text().notNull(),
  updated_at: text().notNull(),
}
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  google_id: text().notNull().unique(),
  email: text().notNull(),
  name: text().notNull(),
  avatar_url: text(),
  approved: integer({ mode: "boolean" }).notNull().default(false),
  is_admin: integer({ mode: "boolean" }).notNull().default(false),
  // Everyone approved can add/change/remove logins unless an admin makes them view-only.
  can_edit: integer({ mode: "boolean" }).notNull().default(true),
  can_backup: integer({ mode: "boolean" }).notNull().default(true),
  ...timestamps,
})
// Per-user MCP access token. Kept out of `users` so user listings never carry token material.
export const mcpTokens = sqliteTable("mcp_tokens", {
  user_id: text()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  token_hash: text().notNull().unique(),
  encrypted_token: text().notNull(),
  created_at: text().notNull(),
  last_used_at: text(),
})
export const sessions = sqliteTable("sessions", {
  token_hash: text().primaryKey(),
  user_id: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires_at: integer().notNull(),
})
export const oauthStates = sqliteTable("oauth_states", {
  state: text().primaryKey(),
  verifier: text().notNull(),
  redirect: text(),
  challenge: text(),
  expires_at: integer().notNull(),
})
export const exchanges = sqliteTable("exchanges", {
  code_hash: text().primaryKey(),
  user_id: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  challenge: text().notNull(),
  expires_at: integer().notNull(),
})
export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  name: text().notNull(),
  tags: text({ mode: "json" }).$type<string[]>().notNull().default([]),
  icon: text().notNull().default(""),
  description: text().notNull(),
  urls: text({ mode: "json" }).$type<string[]>().notNull(),
  login_path: text().notNull(),
  selectors: text({ mode: "json" }).$type<Project["selectors"]>().notNull(),
  ...timestamps,
})
export const accounts = sqliteTable(
  "accounts",
  {
    id: text().primaryKey(),
    project_id: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text().notNull(),
    tags: text({ mode: "json" }).$type<string[]>().notNull().default([]),
    icon: text().notNull().default(""),
    notes: text().notNull().default(""),
    websites: text({ mode: "json" }).$type<Website[]>(),
    email: text().notNull(),
    environment: text().notNull().default(""),
    favicon: text({ mode: "json" }).$type<WebsiteIcon>(),
    encrypted_password: text(),
    login_type: text({ enum: ["password", "google"] }).notNull(),
    is_default: integer({ mode: "boolean" }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("one_default_per_project")
      .on(t.project_id)
      .where(sql`${t.is_default} = 1`),
  ]
)
export const preferences = sqliteTable(
  "preferences",
  {
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    project_id: text()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    account_id: text().references(() => accounts.id, { onDelete: "set null" }),
    auto_login: integer({ mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.project_id] })]
)
import { sql } from "drizzle-orm"

export const personalItems = sqliteTable("personal_items", {
  id: text().primaryKey(),
  owner_id: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text().$type<import("@workspace/shared").PersonalKind>().notNull(),
  title: text().notNull(),
  icon: text().notNull().default(""),
  tags: text({ mode: "json" }).$type<string[]>().notNull().default([]),
  encrypted_fields: text().notNull(),
})

export const attachments = sqliteTable("attachments", {
  account_id: text().references(() => accounts.id, { onDelete: "set null" }),
  id: text().primaryKey(),
  owner_id: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  size: integer().notNull(),
  created_at: text().notNull(),
})
export const collections = sqliteTable("collections", {
  project_id: text().references(() => projects.id, { onDelete: "cascade" }),
  id: text().primaryKey(),
  name: text().notNull().unique(),
  tag: text().notNull(),
})
export const activities = sqliteTable("activities", {
  id: integer().primaryKey({ autoIncrement: true }),
  item_id: text().notNull(),
  actor: text().notNull(),
  source: text().notNull(),
  action: text().notNull(),
  fields: text({ mode: "json" }).$type<string[]>().notNull(),
  at: text().notNull(),
})
