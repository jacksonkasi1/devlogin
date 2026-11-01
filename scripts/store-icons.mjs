// Renders the extension icons from apps/extension/store/*.svg into
// apps/extension/public/icon/<size>.png, where WXT picks them up.
import { chromium } from "@playwright/test"
import { mkdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const store = resolve("apps/extension/store")
const out = resolve("apps/extension/public/icon")
mkdirSync(out, { recursive: true })
const svg = (name) =>
  `data:image/svg+xml;base64,${readFileSync(resolve(store, name)).toString("base64")}`
const sizes = [
  [16, "icon-small.svg"],
  [32, "icon-small.svg"],
  [48, "icon.svg"],
  [96, "icon.svg"],
  [128, "icon.svg"],
]
const browser = await chromium.launch()
for (const [size, source] of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style><img src="${svg(source)}" width="${size}" height="${size}" style="display:block">`
  )
  await page.screenshot({ path: resolve(out, `${size}.png`), omitBackground: true })
  await page.close()
}
await browser.close()
console.log(`Icons written to ${out}`)
