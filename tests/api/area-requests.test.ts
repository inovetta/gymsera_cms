import { describe, it, expect, afterEach } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { areaRequestsApi } from '@/lib/api/area-requests'
import { placesApi } from '@/lib/api/places'
import apiClient from '@/lib/api/client'

/**
 * NEW-265 Part A (A3, A6): the area-request calls the CMS makes, path and body exactly as the API
 * contract (spec §13 "NEW-265 Part A").
 */
const sent: InternalAxiosRequestConfig[] = []
const record = () => {
  sent.length = 0
  apiClient.defaults.adapter = async (config) => {
    sent.push(config)
    return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config }
  }
}
const last = () => sent[sent.length - 1]
const body = () => JSON.parse(String(last().data || '{}'))

afterEach(() => {
  apiClient.defaults.adapter = undefined
})

describe('NEW-265: area-request API calls', () => {
  it('host: check, create (confirmNotListed only when true), read', async () => {
    record()
    await areaRequestsApi.check(7, 'Shinwari Town')
    expect([last().method, last().url]).toEqual(['post', '/places/area-requests/check'])
    expect(body()).toEqual({ cityId: 7, name: 'Shinwari Town' })
    await areaRequestsApi.create(7, 'Shinwari Town', true)
    expect([last().method, last().url]).toEqual(['post', '/places/area-requests'])
    expect(body()).toEqual({ cityId: 7, name: 'Shinwari Town', confirmNotListed: true })
    await areaRequestsApi.create(7, 'Shinwari Town')
    expect(body()).toEqual({ cityId: 7, name: 'Shinwari Town' })
    await areaRequestsApi.get(5)
    expect([last().method, last().url]).toEqual(['get', '/places/area-requests/5'])
  })

  it('admin: list, approve (pin optional), merge, reject, retry, aliases', async () => {
    record()
    await areaRequestsApi.list({ status: 'pending_review', cityId: 7, page: 2 })
    expect([last().method, last().url, last().params]).toEqual(['get', '/admin/area-requests', { status: 'pending_review', cityId: 7, page: 2 }])
    await areaRequestsApi.approve(11, { name: 'Shinwari Town', applyToGroup: true })
    expect([last().method, last().url]).toEqual(['post', '/admin/area-requests/11/approve'])
    expect(body()).toEqual({ name: 'Shinwari Town', applyToGroup: true })
    await areaRequestsApi.merge(11, { areaId: 30, applyToGroup: false })
    expect([last().url, body()]).toEqual(['/admin/area-requests/11/merge', { areaId: 30, applyToGroup: false }])
    await areaRequestsApi.reject(11, { reason: 'Not here', applyToGroup: true })
    expect([last().url, body()]).toEqual(['/admin/area-requests/11/reject', { reason: 'Not here', applyToGroup: true }])
    await areaRequestsApi.retry(11)
    expect([last().method, last().url]).toEqual(['post', '/admin/area-requests/11/retry'])
    await areaRequestsApi.aliases(30)
    expect([last().method, last().url]).toEqual(['get', '/admin/areas/30/aliases'])
    await areaRequestsApi.deleteAlias(5)
    expect([last().method, last().url]).toEqual(['delete', '/admin/area-aliases/5'])
  })

  it('area autocomplete asks for roads and landmarks only when extended', async () => {
    record()
    await placesApi.autocomplete({ input: 'War', kind: 'area', sessionToken: 's', cityId: 7, extended: true })
    expect(last().params).toEqual({ input: 'War', kind: 'area', sessionToken: 's', cityId: 7, extended: 'true' })
    await placesApi.autocomplete({ input: 'War', kind: 'area', sessionToken: 's', cityId: 7 })
    expect(last().params).toEqual({ input: 'War', kind: 'area', sessionToken: 's', cityId: 7 })
  })
})
