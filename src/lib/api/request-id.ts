/**
 * A new request id: a UUID v4, sent as `X-Request-Id` on every API call (OBS-01), so a call can be
 * found in the server logs by the same id the error screens show (API-01).
 * The server accepts 1-64 characters from [A-Za-z0-9._:-] and replaces anything else.
 *
 * `crypto.randomUUID` exists only in secure contexts (https, localhost); on plain http, such as a
 * LAN address in development, it is missing, so fall back to `getRandomValues`, then `Math.random`.
 */
export function newRequestId(): string {
  const c: Crypto | undefined = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()

  const b = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10xx
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
