import { Database, type SQLQueryBindings } from "bun:sqlite"
import { readFileSync, readdirSync } from "node:fs"

// Test adapter only; production uses Cloudflare's D1 binding.
export function testDatabase() {
  const sqlite = new Database(":memory:")
  sqlite.exec("PRAGMA foreign_keys = ON")
  const migrations = new URL("../apps/worker/migrations/", import.meta.url)
  for (const file of readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"))
  }
  class Statement {
    constructor(
      readonly query: string,
      readonly params: SQLQueryBindings[] = []
    ) {}
    bind(...params: SQLQueryBindings[]) {
      return new Statement(this.query, params)
    }
    async raw() {
      return sqlite.query(this.query).values(...this.params)
    }
    async all() {
      return {
        results: sqlite.query(this.query).all(...this.params),
        success: true,
        meta: {},
      }
    }
    async run() {
      return {
        results: [],
        success: true,
        meta: sqlite.query(this.query).run(...this.params),
      }
    }
  }
  return {
    sqlite,
    binding: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) => {
        sqlite.exec("BEGIN")
        try {
          const rows = []
          for (const statement of statements) rows.push(await statement.all())
          sqlite.exec("COMMIT")
          return rows
        } catch (error) {
          sqlite.exec("ROLLBACK")
          throw error
        }
      },
    },
  }
}
