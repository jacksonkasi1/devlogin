import {
  existsSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from "node:fs"
const file = new URL("../apps/worker/.dev.vars", import.meta.url)
const text = existsSync(file) ? readFileSync(file, "utf8") : ""
if (/^CREDENTIAL_KEY=/m.test(text)) {
  console.log("CREDENTIAL_KEY already exists; preserved it.")
} else {
  const key = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
  )
  if (!existsSync(file))
    writeFileSync(
      file,
      "# Local secrets; ignored by Git. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET here.\nAPP_ORIGIN=http://localhost:8787\nDEV_ORIGIN=http://localhost:5173\nEXTENSION_IDS=\n"
    )
  appendFileSync(file, `\nCREDENTIAL_KEY=${key}\n`)
  console.log(
    "Created CREDENTIAL_KEY in apps/worker/.dev.vars. Keep a secure backup; do not rotate it without re-encrypting stored credentials."
  )
}
