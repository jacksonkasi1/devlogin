// Composes the raw captures from store-screenshots.mjs into Chrome Web Store
// screenshots (1280x800) and promo tiles (440x280, 1400x560) as JPEG, which the
// store accepts without the PNG alpha-channel restriction.
import { chromium } from "@playwright/test"
import { mkdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const store = resolve("apps/extension/store")
const out = resolve(store, "listing")
mkdirSync(out, { recursive: true })
const data = (file, type = "image/png") =>
  `data:${type};base64,${readFileSync(resolve(store, file)).toString("base64")}`
const icon = data("icon.svg", "image/svg+xml")

const base = `
  * { box-sizing: border-box; margin: 0 }
  body { font-family: Inter, "Segoe UI", system-ui, sans-serif; overflow: hidden;
    background: radial-gradient(120% 120% at 0% 0%, #3b6cff 0%, #1d3fd6 45%, #0b1a6b 100%); color: #fff }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 20px; letter-spacing: -.01em }
  .brand img { width: 40px; height: 40px; margin: -5px }
  h1 { font-size: 46px; line-height: 1.08; letter-spacing: -.035em; font-weight: 800 }
  p { font-size: 20px; line-height: 1.45; color: #dbe4ff }
  .shot { border-radius: 14px; box-shadow: 0 30px 80px rgba(3, 10, 50, .55), 0 0 0 1px rgba(255,255,255,.12); display: block }
`

// Text on the left, capture on the right, sized to fit the 1280x800 frame.
function split({ title, body, image, width }) {
  return `<style>${base}
    .wrap { display: grid; grid-template-columns: 380px 1fr; align-items: center; gap: 48px; height: 800px; padding: 0 0 0 64px }
    .copy { display: grid; gap: 22px }
  </style>
  <div class="wrap">
    <div class="copy"><div class="brand"><img src="${icon}">Global Login</div><h1>${title}</h1><p>${body}</p></div>
    <div><img class="shot" src="${image}" style="width:${width}px"></div>
  </div>`
}
// Headline on top, wide capture bleeding off the bottom edge.
function stacked({ title, body, image }) {
  return `<style>${base}
    .top { text-align: center; padding: 52px 120px 34px; display: grid; gap: 12px; justify-items: center }
    h1 { font-size: 42px } p { font-size: 19px }
    .shot { width: 1080px; margin: 0 auto; border-radius: 14px 14px 0 0 }
  </style>
  <div class="top"><div class="brand"><img src="${icon}">Global Login</div><h1>${title}</h1><p>${body}</p></div>
  <img class="shot" src="${image}">`
}

const screenshots = [
  stacked({
    title: "Every team login, one shortcut away",
    body: "Press Ctrl+Shift+Space on any site to search shared logins and fill them instantly.",
    image: data("raw/quick-light.png"),
  }),
  split({
    title: "Open &amp; fill in one click",
    body: "The right account for staging, QA or production — opened and signed in for you.",
    image: data("raw/popup-light.png"),
    width: 740,
  }),
  stacked({
    title: "Secure notes live next to your logins",
    body: "VPN details, test cards and checklists — encrypted, searchable, and shared with your team.",
    image: data("raw/quick-search-dark.png"),
  }),
  stacked({
    title: "Organise everything by project",
    body: "Admins manage projects, logins and notes from the web dashboard. Changes sync to every teammate.",
    image: data("raw/web-project.png"),
  }),
  split({
    title: "Made for daily use, day or night",
    body: "Keyboard first, light and dark themes, and nothing stored in plain text on your device.",
    image: data("raw/popup-dark.png"),
    width: 740,
  }),
]

const small = `<style>${base}
  body { display: grid; place-items: center; height: 280px }
  .c { display: grid; justify-items: center; gap: 10px; text-align: center }
  .c img { width: 104px; height: 104px; margin: -14px }
  .n { font-size: 30px; font-weight: 800; letter-spacing: -.03em }
  .t { font-size: 15px; color: #dbe4ff }
</style><div class="c"><img src="${icon}"><div class="n">Global Login</div><div class="t">Shared team logins, filled in one click</div></div>`

const marquee = `<style>${base}
  body { height: 560px; display: grid; grid-template-columns: 560px 1fr; align-items: center; padding-left: 80px }
  .c { display: grid; gap: 20px }
  .c > img { width: 112px; height: 112px; margin: -14px }
  h1 { font-size: 56px }
  .shot { width: 820px; border-radius: 14px 0 0 14px }
</style>
<div class="c"><img src="${icon}"><h1>Global Login</h1><p>Your team's shared logins and secure notes, filled in one click on every environment.</p></div>
<img class="shot" src="${data("raw/quick-light.png")}">`

const browser = await chromium.launch()
async function render(html, width, height, file) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(html)
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(out, file), type: "jpeg", quality: 92 })
  await page.close()
}
for (const [i, html] of screenshots.entries())
  await render(html, 1280, 800, `screenshot-${i + 1}.jpg`)
await render(small, 440, 280, "promo-small-440x280.jpg")
await render(marquee, 1400, 560, "promo-marquee-1400x560.jpg")
await browser.close()
console.log(`Listing images in ${out}`)
