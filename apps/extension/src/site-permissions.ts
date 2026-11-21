export function forbidden(
  address: string,
  backend: string,
  excluded: string[] = []
) {
  const url = new URL(address)
  return (
    !["http:", "https:"].includes(url.protocol) ||
    !(
      url.protocol === "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) ||
    url.origin === backend ||
    excluded.includes(url.origin) ||
    /(^|\.)(google\.com|googleapis\.com|gstatic\.com)$/.test(url.hostname)
  )
}
