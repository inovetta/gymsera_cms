/**
 * NEW-132 — the CMS fell back to http://localhost:3000 whenever NEXT_PUBLIC_API_URL was unset
 * (src/lib/api/client.ts, src/lib/csp.ts, src/lib/realtime/client.ts), so a production build
 * without it shipped an admin panel that calls the admin's own machine. Like the mobile app
 * (REL-ENV: release builds need APP_ENV), a production build now fails without an explicit API URL.
 * The fallback stays the local API for `next dev` and tests: a developer without the variable never
 * administers production by accident.
 */
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants'

const saved = process.env.NEXT_PUBLIC_API_URL
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_API_URL
  else process.env.NEXT_PUBLIC_API_URL = saved
  vi.resetModules()
})

const loadConfig = async () => (await import('../../next.config.mjs')).default as unknown

describe('next build needs NEXT_PUBLIC_API_URL', () => {
  it('a production build without it fails, naming the variable and an example', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    const config = await loadConfig()
    expect(typeof config).toBe('function')
    expect(() => (config as (phase: string) => unknown)(PHASE_PRODUCTION_BUILD)).toThrow(
      /NEXT_PUBLIC_API_URL is not set.*https:\/\/api\.gymsera\.com/s
    )
  })

  it.each([
    ['empty', ''],
    ['not a URL', 'api.gymsera.com'],
    ['not http(s)', 'ftp://api.gymsera.com'],
    ['with a path (the client adds /api/v1 itself)', 'https://api.gymsera.com/api/v1'],
  ])('a production build with a bad value fails: %s', async (_label, value) => {
    process.env.NEXT_PUBLIC_API_URL = value
    const config = (await loadConfig()) as (phase: string) => unknown
    expect(() => config(PHASE_PRODUCTION_BUILD)).toThrow(/NEXT_PUBLIC_API_URL/)
  })

  it.each([['https://api.gymsera.com'], ['https://apistaging.gymsera.com']])(
    'a production build with %s builds',
    async (value) => {
      process.env.NEXT_PUBLIC_API_URL = value
      const config = (await loadConfig()) as (phase: string) => { headers: unknown }
      expect(config(PHASE_PRODUCTION_BUILD)).toEqual(expect.objectContaining({ headers: expect.any(Function) }))
    }
  )

  it('next lint (which loads the config in the build phase) without it still runs', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    const argv = process.argv
    process.argv = [argv[0], 'next', 'lint']
    try {
      const config = (await loadConfig()) as (phase: string) => unknown
      expect(config(PHASE_PRODUCTION_BUILD)).toEqual(expect.objectContaining({ headers: expect.any(Function) }))
    } finally {
      process.argv = argv
    }
  })

  it('next dev without it still starts', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    const config = (await loadConfig()) as (phase: string) => unknown
    expect(config(PHASE_DEVELOPMENT_SERVER)).toEqual(expect.objectContaining({ headers: expect.any(Function) }))
  })
})

describe('one fallback, for next dev and tests only', () => {
  it('the API client and the CSP use the local API when it is unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    const { default: apiClient } = await import('@/lib/api/client')
    const { apiOrigin } = await import('@/lib/csp')
    expect(apiClient.defaults.baseURL).toBe('http://localhost:3000/api/v1')
    expect(apiOrigin()).toBe('http://localhost:3000')
  })

  it('only src/lib/api-url.ts reads NEXT_PUBLIC_API_URL (the client, the CSP and realtime go through it)', async () => {
    const { spawnSync } = await import('child_process')
    const r = spawnSync('git', ['grep', '--untracked', '-l', 'NEXT_PUBLIC_API_URL', '--', 'src'], { encoding: 'utf8' })
    expect(r.stdout.trim().split('\n')).toEqual(['src/lib/api-url.ts'])
  })
})
