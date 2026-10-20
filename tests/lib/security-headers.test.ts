import { describe, it, expect, afterEach } from 'vitest'
import { buildCsp, newNonce, apiOrigin, SENTRY_CONNECT_HOSTS } from '@/lib/csp'
// @ts-expect-error the config is plain JS
import nextConfig from '../../next.config.mjs'

// SEC-18 / SEC-14: security headers on every response and a Report-Only CSP with a per-request nonce.
const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d === name || d.startsWith(`${name} `)) ?? ''

describe('CSP policy', () => {
  const csp = buildCsp({ nonce: 'abc123', development: false, api: 'https://api.example.com' })

  it('allows the KYC blob preview frame and the Leaflet stylesheet', () => {
    expect(directive(csp, 'frame-src')).toContain('blob:')
    expect(directive(csp, 'style-src')).toContain('https://unpkg.com')
  })

  it('production scripts: nonce + strict-dynamic, never unsafe-eval or unsafe-inline', () => {
    const script = directive(csp, 'script-src')
    expect(script).toContain("'nonce-abc123'")
    expect(script).toContain("'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
    expect(script).not.toContain('unsafe-inline')
  })

  it('development adds unsafe-eval (React refresh) and nothing in production does', () => {
    expect(buildCsp({ nonce: 'n', development: true })).toContain("'unsafe-eval'")
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('locks down plugins, base URI, framing and form targets', () => {
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
    expect(directive(csp, 'default-src')).toBe("default-src 'self'")
  })

  it('connect-src allows the API, Google and the Sentry ingest hosts, and nothing like a bare wildcard', () => {
    const connect = directive(csp, 'connect-src')
    expect(connect).toContain('https://api.example.com')
    expect(connect).toContain('wss://api.example.com')
    for (const host of SENTRY_CONNECT_HOSTS) expect(connect).toContain(host)
    expect(connect.split(' ')).not.toContain('*')
    expect(connect).not.toContain('localhost')
  })

  it('reports violations to /api/csp-report', () => {
    expect(csp).toMatch(/report-uri \/api\/csp-report$/)
  })

  it('every request gets a different nonce', () => {
    expect(newNonce()).not.toBe(newNonce())
    expect(newNonce().length).toBeGreaterThanOrEqual(24)
  })
})

describe('apiOrigin', () => {
  const saved = process.env.NEXT_PUBLIC_API_URL
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_API_URL
    else process.env.NEXT_PUBLIC_API_URL = saved
  })
  it('is the origin of NEXT_PUBLIC_API_URL, without a path', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.gymsera.com/api/v1'
    expect(apiOrigin()).toBe('https://api.gymsera.com')
  })
  it('falls back to the local API on a malformed value', () => {
    process.env.NEXT_PUBLIC_API_URL = 'not a url'
    expect(apiOrigin()).toBe('http://localhost:3000')
  })
})

describe('next.config headers()', () => {
  it('sets HSTS, nosniff, Referrer-Policy, frame protection and the enforced CSP part on every path', async () => {
    const rules = await nextConfig.headers()
    expect(rules).toHaveLength(1)
    expect(rules[0].source).toBe('/:path*')
    const h = Object.fromEntries(rules[0].headers.map((x: any) => [x.key, x.value]))
    expect(h['Strict-Transport-Security']).toMatch(/max-age=31536000/)
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Content-Security-Policy']).toBe("frame-ancestors 'none'; base-uri 'self'")
  })
})
