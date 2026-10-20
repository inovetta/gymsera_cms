/**
 * Content Security Policy (SEC-14 / SEC-18).
 *
 * Built per request in middleware.ts so every response carries a fresh nonce. The policy ships as
 * Content-Security-Policy-Report-Only first (R-37): violations are reported to /api/csp-report and logged,
 * nothing is blocked. The part that cannot break a page (frame-ancestors, object-src, base-uri) is enforced
 * from the start by next.config.mjs.
 *
 * What is strong: no 'unsafe-eval' in production, and scripts run only with the request's nonce
 * ('strict-dynamic' lets those scripts load the ones they need, such as Google Maps).
 * What is weaker: style-src keeps 'unsafe-inline' because React and the UI components set style attributes;
 * img-src allows any https host because listing photos and map tiles come from several hosts (next.config
 * remotePatterns already allows `https://**`).
 */

const DEFAULT_API_URL = 'http://localhost:3000'

/** The API origin the browser may call. Same variable the API client reads. */
export const apiOrigin = (): string => {
  const raw = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL
  try {
    return new URL(raw).origin
  } catch {
    return new URL(DEFAULT_API_URL).origin
  }
}

/** Sentry ingest hosts for the client SDK (PR9, waits for the DSN). Listed now so enabling it needs no CSP change. */
export const SENTRY_CONNECT_HOSTS = [
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
  'https://*.ingest.de.sentry.io',
]

export const REPORT_PATH = '/api/csp-report'

/** The API origin as a WebSocket origin, for the realtime connection (socket.io starts on https, upgrades to wss). */
export const socketOrigin = (api: string): string => api.replace(/^http/, 'ws')

export const newNonce = (): string => btoa(crypto.randomUUID())

export interface CspOptions {
  nonce: string
  development?: boolean
  api?: string
}

export const buildCsp = ({ nonce, development = false, api = apiOrigin() }: CspOptions): string => {
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Ignored by browsers that understand 'strict-dynamic'; fallback for the rest.
    'https://accounts.google.com/gsi/client',
  ]
  // React refresh in `next dev` needs eval. Production never does.
  if (development) script.push("'unsafe-eval'")

  const connect = [
    "'self'",
    api,
    socketOrigin(api),
    'https://accounts.google.com',
    ...SENTRY_CONNECT_HOSTS,
  ]
  if (development) connect.push('ws://localhost:*', 'http://localhost:*')

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': script,
    // unpkg.com: the Leaflet stylesheet (map picker).
    'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style', 'https://unpkg.com'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': connect,
    // blob: is the KYC document preview (overview-tab.tsx), a same-origin object URL.
    'frame-src': ['https://accounts.google.com', 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }

  return [
    ...Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`),
    `report-uri ${REPORT_PATH}`,
  ].join('; ')
}
