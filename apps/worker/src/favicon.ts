// Read only a website's public HTML, never credentials.
export function publicWebsite(value: string): URL | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return
    const host = url.hostname.replace(/\.$/, "")
    if (
      !host.includes(".") ||
      /^[\d.]+$/.test(host) ||
      host.includes(":") ||
      /\.(localhost|local|internal|test|invalid|example)$/.test(host)
    )
      return
    return url
  } catch {
    return
  }
}

async function limitedHtml(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const decoder = new TextDecoder()
  let html = "",
    bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 262144) break
      html += decoder.decode(value, { stream: true })
      const end = html.toLowerCase().indexOf("</head>")
      if (end !== -1) return html.slice(0, end + 7)
    }
    return html
  } finally {
    await reader.cancel()
  }
}

export async function declaredFavicon(
  website: URL
): Promise<string | undefined> {
  const signal = AbortSignal.timeout(5000)
  let page = new URL("/", website.origin)
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(page.href, {
      redirect: "manual",
      signal,
      headers: { Accept: "text/html" },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location")
      const next = location && publicWebsite(new URL(location, page).href)
      await response.body?.cancel()
      if (!next) return
      page = next
      continue
    }
    if (
      !response.ok ||
      !response.headers.get("Content-Type")?.includes("text/html")
    ) {
      await response.body?.cancel()
      return
    }
    const html = await limitedHtml(response)
    let base = page.href
    let icon: string | undefined, touchIcon: string | undefined
    await new HTMLRewriter()
      .on("base[href]", {
        element(element) {
          const candidate = publicWebsite(
            new URL(element.getAttribute("href")!, page).href
          )
          if (candidate) base = candidate.href
        },
      })
      .on("link[href][rel]", {
        element(element) {
          const rel = element.getAttribute("rel")!.toLowerCase().split(/\s+/)
          if (!rel.includes("icon") && !rel.includes("apple-touch-icon")) return
          const candidate = publicWebsite(
            new URL(element.getAttribute("href")!, base).href
          )
          if (!candidate) return
          if (rel.includes("icon")) icon ??= candidate.href
          else touchIcon ??= candidate.href
        },
      })
      .transform(new Response(html))
      .text()
    return icon ?? touchIcon
  }
}
