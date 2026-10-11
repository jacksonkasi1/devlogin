import { test, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { readFileSync } from "node:fs"

test("additive folder migration preserves IDs, secrets and per-account website associations", () => {
  const db = new Database(":memory:")
  try {
    const migration = (name: string) =>
      db.exec(
        readFileSync(
          new URL(`../apps/worker/migrations/${name}`, import.meta.url),
          "utf8"
        )
      )
    migration("0000_lumpy_gabe_jones.sql")
    migration("0001_ambiguous_slyde.sql")
    db.query("INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)").run(
      "project",
      "Legacy",
      "Description",
      JSON.stringify([
        "https://sandbox.example.com/app",
        "https://beta.example.com",
        "http://localhost:3000",
      ]),
      "/login",
      JSON.stringify({
        email: "#identity",
        password: "#secret",
        submit: "",
        google: "",
      }),
      "created",
      "updated"
    )
    const insert = db.query(
      "INSERT INTO accounts (id,project_id,label,email,encrypted_password,environment,login_type,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)"
    )
    insert.run(
      "all-sites",
      "project",
      "Admin",
      "admin",
      "ciphertext-1",
      "",
      "password",
      "created",
      "updated"
    )
    insert.run(
      "sandbox-only",
      "project",
      "Tester",
      "tester",
      "ciphertext-2",
      "https://sandbox.example.com",
      "password",
      "created",
      "updated"
    )
    migration("0002_perfect_blindfold.sql")
    const rows = db
      .query(
        "SELECT id,encrypted_password,websites,created_at FROM accounts ORDER BY id"
      )
      .all() as {
      id: string
      encrypted_password: string
      websites: string
      created_at: string
    }[]
    expect(rows).toHaveLength(2)
    expect(rows[0]?.id).toBe("all-sites")
    expect(rows[0]?.encrypted_password).toBe("ciphertext-1")
    expect(rows[0]?.created_at).toBe("created")
    expect(JSON.parse(rows[0]!.websites)).toHaveLength(3)
    expect(JSON.parse(rows[1]!.websites)).toEqual([
      {
        url: "https://sandbox.example.com/app",
        login_path: "/login",
        selectors: {
          email: "#identity",
          password: "#secret",
          submit: "",
          google: "",
        },
      },
    ])
    expect(db.query("SELECT urls FROM projects").get()).toEqual({
      urls: JSON.stringify([
        "https://sandbox.example.com/app",
        "https://beta.example.com",
        "http://localhost:3000",
      ]),
    })
  } finally {
    db.close()
  }
})
