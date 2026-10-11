import { fileURLToPath } from "node:url"
const keys = process.argv.includes("--key-only")
  ? ["CREDENTIAL_KEY"]
  : ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "CREDENTIAL_KEY"]
const values: Record<string, string> = {}
for (const key of keys) {
  const value = process.env[key]
  if (!value || value.startsWith("your-") || value.startsWith("replace-"))
    throw new Error(`Set ${key} in apps/worker/.dev.vars first`)
  values[key] = value
}
const child = Bun.spawn([process.execPath, "x", "wrangler", "secret", "bulk"], {
  cwd: fileURLToPath(new URL("../apps/worker", import.meta.url)),
  stdin: new Blob([JSON.stringify(values)]),
  stdout: "inherit",
  stderr: "inherit",
})
process.exit(await child.exited)
