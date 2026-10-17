import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import apiClient from '@/lib/api/client'
import { newRequestId } from '@/lib/api/request-id'

// OBS-01: every API call carries its own X-Request-Id (a UUID), so one request can be followed from
// the browser into the server logs. A caller-supplied id is kept, and a replay of the same request
// (the 401 token-refresh retry) keeps its id.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const seen: Array<{ url?: string; id?: unknown; config: any }> = []

beforeEach(() => {
  seen.length = 0
  localStorage.clear()
  apiClient.defaults.adapter = async (config) => {
    seen.push({ url: config.url, id: config.headers?.get?.('X-Request-Id'), config })
    return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config }
  }
})
afterEach(() => {
  apiClient.defaults.adapter = undefined
  vi.unstubAllGlobals()
})

describe('newRequestId', () => {
  it('is a UUID v4 and different every time', () => {
    const ids = Array.from({ length: 500 }, () => newRequestId())
    expect(ids.every((id) => UUID_V4.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('fits the server rule: 1-64 characters from [A-Za-z0-9._:-]', () => {
    expect(newRequestId()).toMatch(/^[A-Za-z0-9._:-]{1,64}$/)
  })

  it('still works where crypto.randomUUID does not exist (plain http on a LAN address)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (a: Uint8Array) => {
        for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256)
        return a
      },
    })
    expect(newRequestId()).toMatch(UUID_V4)
  })

  it('still works with no Web Crypto at all', () => {
    vi.stubGlobal('crypto', undefined)
    expect(newRequestId()).toMatch(UUID_V4)
  })
})

describe('the API client sends X-Request-Id (OBS-01)', () => {
  it('adds a fresh UUID to every request, GET and POST alike', async () => {
    await apiClient.get('/team')
    await apiClient.post('/gyms/members/enroll', {})
    await apiClient.get('/me/context')
    expect(seen).toHaveLength(3)
    expect(seen.every((s) => UUID_V4.test(String(s.id)))).toBe(true)
    expect(new Set(seen.map((s) => s.id)).size).toBe(3)
  })

  it('keeps an id the caller set', async () => {
    await apiClient.get('/team', { headers: { 'x-request-id': 'caller-1' } })
    expect(seen[0].id).toBe('caller-1')
  })

  it('a replay of the same request config (token-refresh retry) keeps its id', async () => {
    await apiClient.get('/team')
    await apiClient.request(seen[0].config)
    expect(seen).toHaveLength(2)
    expect(seen[1].id).toBe(seen[0].id)
  })
})
