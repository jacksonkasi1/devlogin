// Copies the Chrome Web Store zip to release/ at the repo root under a clear
// name, and fails if the build still has development-only manifest fields.
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const output = resolve("apps/extension/.output")
const manifest = JSON.parse(
  readFileSync(resolve(output, "chrome-mv3/manifest.json"), "utf8")
)
const local = manifest.host_permissions.filter((host) =>
  /localhost|127\.0\.0\.1/.test(host)
)
if (manifest.key || local.length)
  throw new Error("Not a store build: manifest has a key or localhost hosts")
const zip = readdirSync(output).find((file) =>
  file.endsWith(`-${manifest.version}-chrome.zip`)
)
if (!zip) throw new Error(`No zip for version ${manifest.version} in ${output}`)
mkdirSync("release", { recursive: true })
const target = resolve("release", `global-login-${manifest.version}.zip`)
copyFileSync(resolve(output, zip), target)
console.log(`Chrome Web Store upload: ${target}`)
