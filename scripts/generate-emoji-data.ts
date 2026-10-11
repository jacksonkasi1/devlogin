// Run with Bun when updating the bundled Unicode emoji catalog.
const source = "https://unicode.org/Public/emoji/latest/emoji-test.txt"
const response = await fetch(source)
if (!response.ok) throw new Error(`Emoji download failed: ${response.status}`)
const text = await response.text()
const version = text.match(/^# Version: (.+)$/m)?.[1]
if (!version) throw new Error("Missing Unicode emoji version")
let category = ""
const entries: [string, string, string][] = []
for (const line of text.split("\n")) {
  if (line.startsWith("# group: ")) category = line.slice(9).trim()
  const match = line.match(
    /^([A-F0-9 ]+)\s*; fully-qualified\s*# \S+ E[\d.]+ (.+)$/
  )
  if (!match) continue
  entries.push([
    String.fromCodePoint(
      ...match[1]!
        .trim()
        .split(/\s+/)
        .map((hex) => parseInt(hex, 16))
    ),
    match[2]!.trim(),
    category,
  ])
}
if (entries.length < 3000) throw new Error("Incomplete emoji catalog")
await Bun.write(
  new URL("../packages/ui/src/lib/emoji-data.ts", import.meta.url),
  `// Unicode Emoji ${version}; source: ${source}\n// Unicode data license: ./UNICODE-LICENSE.txt\nexport const emojis: [string, string, string][] = ${JSON.stringify(entries)}\n`
)
const license = await fetch("https://www.unicode.org/license.txt")
if (!license.ok) throw new Error("Unicode license download failed")
const licenseText = await license.text()
for (const path of [
  "packages/ui/src/lib/UNICODE-LICENSE.txt",
  "apps/web/public/unicode-license.txt",
  "apps/extension/public/unicode-license.txt",
])
  await Bun.write(new URL(`../${path}`, import.meta.url), licenseText)
console.log(`Generated ${entries.length} Unicode Emoji ${version} entries`)
