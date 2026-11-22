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

async function limitedHtml(response: Response, headOnly = true) {
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
      if (bytes > 262144) {
        html += decoder.decode(
          value.subarray(0, 262144 - (bytes - value.byteLength))
        )
        break
      }
      html += decoder.decode(value, { stream: true })
      const end = html.toLowerCase().indexOf("</head>")
      if (headOnly && end !== -1) return html.slice(0, end + 7)
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
    const html = await limitedHtml(response, false)
    let base = page.href
    const resolve = (value: string | null, from = base) => {
      if (!value) return
      try {
        return publicWebsite(new URL(value, from).href)?.href
      } catch {
        return
      }
    }
    let iconScore = -1
    let icon: string | undefined,
      touch: string | undefined,
      mask: string | undefined
    let manifest: string | undefined,
      logo: string | undefined,
      social: string | undefined
    await new HTMLRewriter()
      .on("base[href]", {
        element(el) {
          base = resolve(el.getAttribute("href"), page.href) ?? base
        },
      })
      .on("link[rel][href]", {
        element(el) {
          const rel = el.getAttribute("rel")!.toLowerCase().split(/\s+/)
          const href = resolve(el.getAttribute("href"))
          if (rel.includes("icon") && href) {
            const sizes = el.getAttribute("sizes") ?? ""
            const size = Math.max(
              0,
              ...Array.from(sizes.matchAll(/(\d+)x(\d+)/gi), (m) =>
                Math.min(Number(m[1]), Number(m[2]))
              )
            )
            const score =
              /svg/i.test(el.getAttribute("type") ?? "") ||
              /\.svg$/i.test(new URL(href).pathname)
                ? 512
                : Math.min(256, size) ||
                  (/\.ico$/i.test(new URL(href).pathname) ? 1 : 16)
            if (score > iconScore) {
              icon = href
              iconScore = score
            }
          }
          if (rel.some((r) => r.startsWith("apple-touch-icon"))) touch ??= href
          if (rel.includes("mask-icon")) mask ??= href
          if (rel.includes("manifest")) manifest ??= href
        },
      })
      .on("meta[content]", {
        element(el) {
          const prop = (
            el.getAttribute("property") ??
            el.getAttribute("name") ??
            el.getAttribute("itemprop")
          )?.toLowerCase()
          if (prop === "msapplication-tileimage" || prop === "logo")
            logo ??= resolve(el.getAttribute("content"))
          if (prop === "og:image" || prop === "twitter:image")
            social ??= resolve(el.getAttribute("content"))
        },
      })
      .on("img[src]", {
        element(el) {
          if (
            /logo|brandmark|wordmark/i.test(
              ["src", "alt", "id", "class"]
                .map((key) => el.getAttribute(key))
                .join(" ")
            )
          )
            logo ??= resolve(el.getAttribute("src"))
        },
      })
      .transform(new Response(html))
      .text()
    if (icon || touch) return iconScore >= 128 ? icon : (touch ?? icon)
    if (manifest) {
      try {
        const response = await fetch(manifest, {
          signal,
          redirect: "manual",
          headers: { Accept: "application/manifest+json,application/json" },
        })
        if (response.ok) {
          const data = JSON.parse(await limitedHtml(response, false))
          if (Array.isArray(data.icons)) {
            for (const entry of data.icons) {
              const src =
                typeof entry?.src === "string" && resolve(entry.src, manifest)
              if (src) return src
            }
          }
        } else await response.body?.cancel()
      } catch {
        /* A broken manifest may still have a usable HTML fallback. */
      }
    }
    return mask ?? logo ?? social
  }
}
