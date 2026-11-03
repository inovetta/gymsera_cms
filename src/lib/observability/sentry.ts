/**
 * Error tracking (NEW-208, R-53). Inert until NEXT_PUBLIC_SENTRY_DSN is set at build time: no SDK
 * init, nothing sent. Owner rules (2026-11-03):
 *  - errors only: no performance tracing, no session replay, no user feedback widget;
 *  - sendDefaultPii off;
 *  - before anything leaves the browser or the server, request and response bodies, cookies,
 *    auth headers, e-mail addresses, phone numbers and tokens are removed (scrubEvent,
 *    scrubBreadcrumb);
 *  - the DSN is never committed and never logged.
 * Variables (the same names as the API's SENTRY_*): NEXT_PUBLIC_SENTRY_DSN,
 * NEXT_PUBLIC_SENTRY_ENVIRONMENT, NEXT_PUBLIC_SENTRY_RELEASE.
 *
 * Used by instrumentation-client.ts (browser), sentry.server.config.ts and sentry.edge.config.ts.
 * The tests in tests/regression/new-208-sentry.test.ts fail if any rule above is broken.
 */
import type { Breadcrumb, ErrorEvent, EventHint } from '@sentry/nextjs'

/** The part of a Sentry integration the filter below reads. */
type Integration = { name: string }

type Env = Record<string, string | undefined>

/** Integrations that would send more than errors. Removed even if an SDK update adds them by default. */
export const FORBIDDEN_INTEGRATIONS = [
  'BrowserTracing',
  'Replay',
  'ReplayCanvas',
  'Feedback',
  'BrowserProfiling',
  'Http', // server spans; errors are still captured through onRequestError
] as const

const REDACTED = '[redacted]'

const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-refresh-token',
  'x-api-key',
  'x-csrf-token',
  'x-xsrf-token',
])

const SECRET_KEYS = /^(password|pass|pwd|token|access_?token|refresh_?token|id_?token|auth|authorization|secret|code|otp|api_?key|session|cookie|email|phone|mobile|cnic)$/i

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// A phone number: optional +, then 9 to 15 digits that may be split by spaces, dots or dashes. No
// lookbehind: older Safari cannot parse it, and a parse error would stop the whole bundle.
const PHONE = /(^|[^\w/.-])(\+?\d(?:[\s.-]?\d){8,14})(?![\w/-])/g
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g
const LONG_SECRET = /\b[A-Za-z0-9_-]{32,}\b/g
// A request reference (UUID) is kept: it is how a report is matched to the API's logs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SECRET_QUERY = /([?&](?:token|access_token|refresh_token|id_token|code|password|email|phone|otp|key)=)[^&#\s]*/gi

/** Removes e-mail addresses, phone numbers and tokens from free text. */
export function scrubText(value: string): string {
  return value
    .replace(SECRET_QUERY, `$1${REDACTED}`)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(EMAIL, '[email]')
    .replace(LONG_SECRET, (m) => (UUID.test(m) ? m : REDACTED))
    .replace(PHONE, '$1[phone]')
}

/** Deep copy of `value` with secret keys dropped and every string scrubbed. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED
  if (typeof value === 'string') return scrubText(value)
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? REDACTED : scrubValue(v, depth + 1)
    }
    return out
  }
  return value
}

const scrubHeaders = (headers: Record<string, string> | undefined) => {
  if (!headers) return headers
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (SECRET_HEADERS.has(k.toLowerCase())) continue
    out[k] = scrubText(String(v))
  }
  return out
}

/** beforeSend: nothing personal or secret leaves. Never throws; returns the scrubbed event. */
export function scrubEvent<T extends ErrorEvent>(event: T, _hint?: EventHint): T {
  try {
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
      event.request.headers = scrubHeaders(event.request.headers as Record<string, string> | undefined)
      // A bare query string has no leading ?: add one so its token=, email= ... values are matched.
      if (typeof event.request.query_string === 'string') event.request.query_string = scrubText(`?${event.request.query_string}`).slice(1)
      else if (event.request.query_string) event.request.query_string = REDACTED
      if (event.request.url) event.request.url = scrubText(event.request.url)
    }
    if (event.contexts?.response) delete (event.contexts.response as Record<string, unknown>).data
    if (event.user) event.user = event.user.id ? { id: event.user.id } : {}
    if (event.message) event.message = scrubText(event.message)
    if (event.logentry?.message) event.logentry.message = scrubText(event.logentry.message)
    for (const ex of event.exception?.values ?? []) {
      if (ex.value) ex.value = scrubText(ex.value)
    }
    if (event.extra) event.extra = scrubValue(event.extra) as T['extra']
    if (event.tags) event.tags = scrubValue(event.tags) as T['tags']
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((b) => scrubBreadcrumb(b)).filter(Boolean) as Breadcrumb[]
    }
  } catch {
    // A scrubber failure must not send the raw event.
    return { ...event, request: undefined, extra: undefined, breadcrumbs: [], message: REDACTED } as T
  }
  return event
}

/** beforeBreadcrumb: keeps what happened (category, method, status), never bodies or secrets. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const out: Breadcrumb = { ...crumb }
  if (out.message) out.message = scrubText(out.message)
  if (out.data) {
    const data = { ...out.data }
    for (const k of ['body', 'request_body', 'response_body', 'requestBody', 'responseBody', 'input', 'arguments']) delete data[k]
    out.data = scrubValue(data) as Breadcrumb['data']
  }
  return out
}

const withoutForbidden = <T extends Integration>(integrations: T[]): T[] =>
  integrations.filter((i) => !(FORBIDDEN_INTEGRATIONS as readonly string[]).includes(i.name))

/**
 * Sentry.init options, or null when no DSN is set (then nothing is initialised or sent). The DSN is
 * read here and nowhere else; it is never printed.
 */
export function sentryOptions(env: Env = process.env) {
  const dsn = (env.NEXT_PUBLIC_SENTRY_DSN || '').trim()
  if (!dsn) return null
  return {
    dsn,
    environment: (env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || '').trim() || 'production',
    release: (env.NEXT_PUBLIC_SENTRY_RELEASE || '').trim() || undefined,
    sendDefaultPii: false,
    // Errors only: no performance tracing, no profiling, no session replay.
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    integrations: withoutForbidden,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSendTransaction: () => null,
  }
}
