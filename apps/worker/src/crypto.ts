export function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}
export function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}
export async function hash(value: string) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
    )
  )
}
async function key(secret: string) {
  const bytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0))
  if (bytes.length !== 32)
    throw new Error("CREDENTIAL_KEY must encode 32 bytes")
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ])
}
export async function encrypt(
  value: string,
  secret: string,
  accountId: string
) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(accountId),
    },
    await key(secret),
    new TextEncoder().encode(value)
  )
  return `v1.${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(ciphertext)))}`
}
export async function decrypt(
  value: string,
  secret: string,
  accountId: string
) {
  const [version, nonce, data] = value.split(".")
  if (version !== "v1" || !nonce || !data) throw new Error("Invalid ciphertext")
  const bytes = (input: string) =>
    Uint8Array.from(atob(input), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(nonce),
        additionalData: new TextEncoder().encode(accountId),
      },
      await key(secret),
      bytes(data)
    )
  )
}
