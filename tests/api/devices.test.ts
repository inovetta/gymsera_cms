import { describe, it, expect, afterEach } from 'vitest'
import apiClient from '@/lib/api/client'
import { devicesApi } from '@/lib/api/devices'

/**
 * ZKTeco Phase 1: the access-device client calls gymsera_be `src/routes/host-devices.routes.js`
 * (`/api/v1/host/devices`) with exactly the fields the routes declare (validate.strict, stage 2).
 * Real client with a capturing adapter, so the request is the one axios sends.
 */
const original = apiClient.defaults.adapter
let seen: { url: string; method?: string; data: unknown; params?: unknown }[] = []

const capture = (data: unknown = { success: true, data: {} }) => {
  seen = []
  apiClient.defaults.adapter = async (config) => {
    seen.push({ url: apiClient.getUri(config), method: config.method, data: config.data ? JSON.parse(config.data as string) : undefined })
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
}

afterEach(() => {
  apiClient.defaults.adapter = original
})

describe('devicesApi', () => {
  it('list: GET /host/devices, with ?branchId only when one is chosen', async () => {
    capture({ success: true, data: { devices: [] } })
    await devicesApi.list()
    await devicesApi.list('branch-1')
    expect(seen[0]).toMatchObject({ method: 'get' })
    expect(seen[0].url).toMatch(/\/host\/devices$/)
    expect(seen[1].url).toMatch(/\/host\/devices\?branchId=branch-1$/)
  })

  it('create: POST /host/devices with branch, name, direction; link mode and serial only when set', async () => {
    capture()
    await devicesApi.create({ branchId: 'b1', name: 'Front door IN', direction: 'in' })
    await devicesApi.create({ branchId: 'b1', name: 'Gate', direction: 'out', linkMode: 'serial', serialNumber: 'CQZ7224460123' })
    expect(seen[0]).toMatchObject({ method: 'post', data: { branchId: 'b1', name: 'Front door IN', direction: 'in' } })
    expect(Object.keys(seen[0].data as object).sort()).toEqual(['branchId', 'direction', 'name'])
    expect(seen[1].data).toEqual({ branchId: 'b1', name: 'Gate', direction: 'out', linkMode: 'serial', serialNumber: 'CQZ7224460123' })
  })

  it('get, update, repair, remove: the device routes', async () => {
    capture()
    await devicesApi.get('d1')
    await devicesApi.update('d1', { name: 'Main gate', enabled: false })
    await devicesApi.repair('d1')
    await devicesApi.remove('d1')
    expect(seen.map((s) => [s.method, new URL(s.url).pathname.replace(/^.*\/host/, '/host')])).toEqual([
      ['get', '/host/devices/d1'],
      ['patch', '/host/devices/d1'],
      ['post', '/host/devices/d1/repair'],
      ['delete', '/host/devices/d1'],
    ])
    expect(seen[1].data).toEqual({ name: 'Main gate', enabled: false })
    expect(seen[2].data).toEqual({})
  })
})
