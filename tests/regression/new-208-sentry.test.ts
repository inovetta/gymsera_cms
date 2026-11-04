/**
 * NEW-208 (P10b, R-53): Sentry error tracking, inert until NEXT_PUBLIC_SENTRY_DSN is set.
 * Owner rules 2026-11-03, each guarded here: no performance tracing, no session replay,
 * sendDefaultPii off; request and response bodies, cookies, auth headers, e-mail addresses, phone
 * numbers and tokens are removed before sending; no DSN value is committed; the DSN is never logged.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FORBIDDEN_INTEGRATIONS, scrubBreadcrumb, scrubEvent, scrubText, sentryOptions } from '@/lib/observability/sentry'

const root = join(__dirname, '..', '..')
const FAKE_DSN = 'https://publickey@o0.ingest.sentry.io/0'

const files = (dir: string, out: string[] = []): string[] => {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', 'test-results', 'playwright-report', '.git'].includes(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx|js|mjs|cjs|json|env|example|yml|yaml|md)$/.test(name) || name.startsWith('.env')) out.push(p)
  }
  return out
}

const sourceFiles = () =>
  [...files(join(root, 'src')), ...readdirSync(root).filter((f) => /\.(ts|mjs|js)$/.test(f)).map((f) => join(root, f))].filter(
    (f) => !f.endsWith('src/lib/observability/sentry.ts')
  )

describe('NEW-208: inert without a DSN', () => {
  it('no DSN: no options, so nothing is initialised', () => {
    expect(sentryOptions({})).toBeNull()
    expect(sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: '  ' })).toBeNull()
  })

  it('the browser, server and edge set-up start Sentry only from sentryOptions, and only when it is not null', () => {
    for (const f of ['src/instrumentation-client.ts', 'src/instrumentation.ts']) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src).toContain('sentryOptions(')
      expect(src).toMatch(/if \(!options\) return/)
    }
    const initCallers = sourceFiles().filter((f) => /\.init\(/.test(readFileSync(f, 'utf8')) && /sentry/i.test(readFileSync(f, 'utf8')))
    expect(initCallers.map((f) => relative(root, f)).sort()).toEqual(['src/instrumentation-client.ts', 'src/instrumentation.ts'])
  })
})

describe('NEW-208: errors only, no personal data by default', () => {
  const options = sentryOptions({ NEXT_PUBLIC_SENTRY_DSN: FAKE_DSN, NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'staging', NEXT_PUBLIC_SENTRY_RELEASE: 'cms@1' })!

  it('sendDefaultPii is off; tracing, profiling, replay and logs are off', () => {
    expect(options.sendDefaultPii).toBe(false)
    expect(options.tracesSampleRate).toBe(0)
    expect(options.profilesSampleRate).toBe(0)
    expect(options.replaysSessionSampleRate).toBe(0)
    expect(options.replaysOnErrorSampleRate).toBe(0)
    expect(options.enableLogs).toBe(false)
    expect(options).not.toHaveProperty('tracesSampler')
    expect(options.beforeSendTransaction()).toBeNull()
    expect(options.environment).toBe('staging')
    expect(options.release).toBe('cms@1')
  })

  it('tracing, replay, feedback and profiling integrations are removed even if a default adds them', () => {
    const given = [...FORBIDDEN_INTEGRATIONS, 'GlobalHandlers', 'Dedupe'].map((name) => ({ name }))
    expect(options.integrations(given as never).map((i: { name: string }) => i.name)).toEqual(['GlobalHandlers', 'Dedupe'])
  })

  it('no source file turns tracing, replay, feedback or default PII on', () => {
    const offenders: string[] = []
    const forbidden = [
      /replayIntegration\s*\(/,
      /browserTracingIntegration\s*\(/,
      /feedbackIntegration\s*\(/,
      /browserProfilingIntegration\s*\(/,
      /sendDefaultPii\s*:\s*true/,
      /tracesSampler\s*:/,
      /(tracesSampleRate|profilesSampleRate|replaysSessionSampleRate|replaysOnErrorSampleRate)\s*:\s*(0?\.\d*[1-9]|[1-9])/,
    ]
    for (const f of sourceFiles()) {
      const src = readFileSync(f, 'utf8')
      for (const re of forbidden) if (re.test(src)) offenders.push(`${relative(root, f)}: ${re}`)
    }
    expect(offenders).toEqual([])
  })
})

describe('NEW-208: scrubbing before anything is sent', () => {
  const event = () =>
    ({
      message: 'Login failed for ali@example.com, call +92 300 1234567, Bearer abc.def.ghi',
      request: {
        url: 'https://cms.gymsera.com/auth/reset?token=s3cr3t&page=2',
        data: '{"password":"hunter2"}',
        cookies: { gymsera_session: '1' },
        headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl', Cookie: 'a=b', 'x-request-id': '7f1c2a9e-4b0d-4c55-9a43-3c2e1d0b9f10', 'User-Agent': 'Mozilla' },
        query_string: 'token=s3cr3t&page=2',
      },
      contexts: { response: { status_code: 500, data: '{"email":"ali@example.com"}' } },
      user: { id: 'user-1', email: 'ali@example.com', ip_address: '1.2.3.4', username: 'ali' },
      exception: { values: [{ type: 'Error', value: 'Request for 03001234567 with token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl' }] },
      extra: { password: 'hunter2', note: 'contact sara@example.org', refreshToken: 'abc', requestId: '7f1c2a9e-4b0d-4c55-9a43-3c2e1d0b9f10' },
      breadcrumbs: [
        { category: 'fetch', data: { url: '/api/v1/auth/login?email=ali@example.com', method: 'POST', status_code: 401, body: '{"password":"x"}' } },
        { category: 'console', message: 'saved +923001234567' },
      ],
    }) as any

  it('bodies, cookies and auth headers are dropped; the request reference is kept', () => {
    const out = scrubEvent(event())
    expect(out.request.data).toBeUndefined()
    expect(out.request.cookies).toBeUndefined()
    expect(Object.keys(out.request.headers).map((k: string) => k.toLowerCase()).sort()).toEqual(['user-agent', 'x-request-id'])
    expect(out.request.headers['x-request-id']).toBe('7f1c2a9e-4b0d-4c55-9a43-3c2e1d0b9f10')
    expect(out.contexts.response.data).toBeUndefined()
    expect(out.breadcrumbs[0].data.body).toBeUndefined()
    expect(out.extra.requestId).toBe('7f1c2a9e-4b0d-4c55-9a43-3c2e1d0b9f10')
  })

  it('e-mail addresses, phone numbers and tokens leave nothing behind', () => {
    const text = JSON.stringify(scrubEvent(event()))
    for (const secret of ['ali@example.com', 'sara@example.org', '300 1234567', '03001234567', '923001234567', 's3cr3t', 'hunter2', 'eyJhbGciOiJIUzI1NiJ9', 'abc.def.ghi', '1.2.3.4']) {
      expect(text).not.toContain(secret)
    }
  })

  it('only the user id is kept', () => {
    expect(scrubEvent(event()).user).toEqual({ id: 'user-1' })
  })

  it('ordinary text is left readable', () => {
    expect(scrubText('Request failed with status code 500')).toBe('Request failed with status code 500')
    expect(scrubText('Cannot read properties of undefined (reading branchId)')).toBe('Cannot read properties of undefined (reading branchId)')
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: '/gym/plans', to: '/gym/members' } })).toEqual({
      category: 'navigation',
      data: { from: '/gym/plans', to: '/gym/members' },
    })
  })
})

describe('NEW-208: no DSN in the repository or in logs', () => {
  it('no committed file holds a Sentry DSN value', () => {
    const dsn = /https?:\/\/[0-9a-f]{16,}@[a-z0-9.-]*sentry\.io\/\d+/i
    const offenders = files(root).filter((f) => !f.includes('/tests/') && dsn.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => relative(root, f))).toEqual([])
    for (const example of ['.env.example', '.env.local.example']) {
      const p = join(root, example)
      if (!existsSync(p)) continue
      const line = readFileSync(p, 'utf8').split('\n').find((l) => l.startsWith('NEXT_PUBLIC_SENTRY_DSN='))
      expect(line).toBe('NEXT_PUBLIC_SENTRY_DSN=')
    }
  })

  it('the Sentry set-up never logs the DSN or the options', () => {
    for (const f of ['src/lib/observability/sentry.ts', 'src/instrumentation-client.ts', 'src/instrumentation.ts']) {
      const src = readFileSync(join(root, f), 'utf8')
      expect(src).not.toMatch(/console\.\w+\([^)]*(dsn|DSN|options)/)
    }
  })
})
