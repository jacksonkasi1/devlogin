// Renders the brand icons from apps/extension/store/*.svg: extension icons into
// apps/extension/public/icon/<size>.png (picked up by WXT) and the web app's
// favicons into apps/web/public.
import { chromium } from "@playwright/test"
import { copyFileSync, mkdirSync, readFileSync } from "node:fs"
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
// Web favicons: SVG for modern browsers, PNG fallback, and a full-bleed
// Apple touch icon (iOS applies its own rounded mask).
const web = resolve("apps/web/public")
copyFileSync(resolve(store, "icon-small.svg"), resolve(web, "favicon.svg"))
for (const [size, file, crop] of [
  [32, "favicon-32.png", false],
  [180, "apple-touch-icon.png", true],
  [512, "icon-512.png", true],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const image = crop
    ? `<div style="width:${size}px;height:${size}px;background:#1d47dc;overflow:hidden"><img src="${svg("icon.svg")}" style="width:${size * 4 / 3}px;height:${size * 4 / 3}px;margin:-${size / 6}px;display:block"></div>`
    : `<img src="${svg("icon-small.svg")}" width="${size}" height="${size}" style="display:block">`
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${image}`)
  await page.screenshot({ path: resolve(web, file), omitBackground: !crop })
  await page.close()
}
await browser.close()
console.log(`Icons written to ${out} and ${web}`)
