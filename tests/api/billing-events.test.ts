import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import apiClient from '@/lib/api/client'
import { adminApi } from '@/lib/api/admin'

// OBS-05: GET /admin/billing-events. The page filters by tenant and status and pages the result.
const seen: Array<{ url?: string; params?: Record<string, unknown> }> = []

beforeEach(() => {
  seen.length = 0
  localStorage.clear()
  apiClient.defaults.adapter = async (config) => {
    seen.push({ url: config.url, params: config.params })
    return {
      data: { success: true, message: 'OK', data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }
})
afterEach(() => {
  apiClient.defaults.adapter = undefined
})

describe('adminApi.getBillingEvents', () => {
  it('calls GET /admin/billing-events with the filters and the page', async () => {
    await adminApi.getBillingEvents({ tenantId: 'tenant-1', status: 'FAILED', page: 2, limit: 20 })
    expect(seen[0].url).toBe('/admin/billing-events')
    expect(seen[0].params).toEqual({ tenantId: 'tenant-1', status: 'FAILED', page: 2, limit: 20 })
  })

  it('sends only what is set', async () => {
    await adminApi.getBillingEvents({ page: 1 })
    expect(seen[0].params).toEqual({ page: 1 })
  })

  it('returns the rows and the pagination as the server sent them', async () => {
    const res = await adminApi.getBillingEvents()
    expect(res.data).toEqual([])
    expect(res.pagination).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 })
  })
})
