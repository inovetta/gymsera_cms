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

  it('create: POST /host/devices with branch, name, direction and the required importFirst; link mode and serial only when set', async () => {
    capture()
    await devicesApi.create({ branchId: 'b1', name: 'Front door IN', direction: 'in', importFirst: false })
    await devicesApi.create({ branchId: 'b1', name: 'Gate', direction: 'out', linkMode: 'serial', serialNumber: 'CQZ7224460123', importFirst: false })
    expect(seen[0]).toMatchObject({ method: 'post', data: { branchId: 'b1', name: 'Front door IN', direction: 'in', importFirst: false } })
    expect(Object.keys(seen[0].data as object).sort()).toEqual(['branchId', 'direction', 'importFirst', 'name'])
    expect(seen[1].data).toEqual({ branchId: 'b1', name: 'Gate', direction: 'out', linkMode: 'serial', serialNumber: 'CQZ7224460123', importFirst: false })
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
    expect(seen[3].data).toBeUndefined()
  })

  // ── Phase 3 (spec §9 to §12): the bodies the strict routes accept ─────────────────────────
  it('remove with wipe: DELETE with { wipeDevice: true, confirmName }', async () => {
    capture()
    await devicesApi.remove('d1', { confirmName: 'Front door' })
    expect(seen[0]).toMatchObject({ method: 'delete', data: { wipeDevice: true, confirmName: 'Front door' } })
  })

  it('push: member (deviceIds only when chosen), remove, branch, device sync, status poll', async () => {
    capture()
    await devicesApi.pushMember('m1')
    await devicesApi.pushMember('m1', ['d1'])
    await devicesApi.removeMember('m1', ['d2'])
    await devicesApi.pushBranch('b1')
    await devicesApi.sync('d1', 'quick')
    await devicesApi.sync('d1', 'audit')
    await devicesApi.pushStatus('REQ0000000000000000000000A')
    const at = (i: number) => [seen[i].method, new URL(seen[i].url).pathname.replace(/^.*\/host/, '/host')]
    expect([0, 1, 2, 3, 4, 5, 6].map(at)).toEqual([
      ['post', '/host/members/m1/device-push'],
      ['post', '/host/members/m1/device-push'],
      ['post', '/host/members/m1/device-remove'],
      ['post', '/host/branches/b1/device-push'],
      ['post', '/host/devices/d1/sync'],
      ['post', '/host/devices/d1/sync'],
      ['get', '/host/device-push-requests/REQ0000000000000000000000A'],
    ])
    expect(seen.slice(0, 6).map((s) => s.data)).toEqual([{}, { deviceIds: ['d1'] }, { deviceIds: ['d2'] }, {}, { mode: 'quick' }, { mode: 'audit' }])
  })

  it('member card, consent, enrol; unlinked link / dismiss; settings; staff door access', async () => {
    capture()
    await devicesApi.memberStatus('m1')
    await devicesApi.giveConsent('m1')
    await devicesApi.withdrawConsent('m1')
    await devicesApi.enroll('m1', 'd1', 9)
    await devicesApi.linkUnlinked('d1', '7', 'm1')
    await devicesApi.dismissUnlinked('d1', '7', true)
    await devicesApi.saveBranchSettings('b1', { capturePhotos: false })
    await devicesApi.staffAccess('u1')
    await devicesApi.setStaffAccess('s1', true)
    const at = (i: number) => [seen[i].method, new URL(seen[i].url).pathname.replace(/^.*\/host/, '/host'), seen[i].data]
    expect(seen.map((_, i) => at(i))).toEqual([
      ['get', '/host/members/m1/device-status', undefined],
      ['post', '/host/devices/members/m1/biometric-consent', { method: 'in_person' }],
      ['delete', '/host/devices/members/m1/biometric-consent', undefined],
      ['post', '/host/members/m1/biometrics/enroll', { deviceId: 'd1', type: 9 }],
      ['post', '/host/devices/d1/unlinked-users/7/link', { memberId: 'm1' }],
      ['post', '/host/devices/d1/unlinked-users/7/dismiss', { removeFromDevice: true }],
      ['put', '/host/devices/branch-settings/b1', { capturePhotos: false }],
      ['get', '/host/devices/staff/by-user/u1', undefined],
      ['patch', '/host/devices/staff/s1/device-access', { deviceAccess: true }],
    ])
  })
})

describe('devicesApi Phase 4 (import, cut-over, move, one template, command log)', () => {
  it('create always sends importFirst (required by the API), true or false', async () => {
    capture()
    await devicesApi.create({ branchId: 'b1', name: 'GBS door', direction: 'in', importFirst: true })
    await devicesApi.create({ branchId: 'b1', name: 'New door', direction: 'in', importFirst: false })
    expect(seen[0].data).toEqual({ branchId: 'b1', name: 'GBS door', direction: 'in', importFirst: true })
    expect(seen[1].data).toEqual({ branchId: 'b1', name: 'New door', direction: 'in', importFirst: false })
  })

  it('import calls: the routes host-devices.routes.js declares, with exactly their fields', async () => {
    capture()
    await devicesApi.startImport('d1')
    await devicesApi.importUsers('d1', 'IMP', { filter: 'unmatched', limit: 50, offset: 50 })
    await devicesApi.importUsers('d1', 'IMP')
    await devicesApi.matchImportUser('d1', 'IMP', '501', { memberId: 'm1' })
    await devicesApi.matchImportUser('d1', 'IMP', '1001', { removeAtGoLive: true })
    await devicesApi.uploadImportMapping('d1', 'IMP', 'pin,email\n501,a@b.c')
    await devicesApi.importPreview('d1', 'IMP')
    await devicesApi.applyImport('d1', 'IMP')
    await devicesApi.rollbackImport('d1', 'IMP')
    await devicesApi.cancelImport('d1', 'IMP')
    expect(seen.map((s) => `${s.method} ${s.url.replace(/^.*\/api\/v1/, '')}`)).toEqual([
      'post /host/devices/d1/imports',
      'get /host/devices/d1/imports/IMP/users?filter=unmatched&limit=50&offset=50',
      'get /host/devices/d1/imports/IMP/users',
      'put /host/devices/d1/imports/IMP/users/501',
      'put /host/devices/d1/imports/IMP/users/1001',
      'post /host/devices/d1/imports/IMP/mapping',
      'get /host/devices/d1/imports/IMP/preview',
      'post /host/devices/d1/imports/IMP/apply',
      'post /host/devices/d1/imports/IMP/rollback',
      'post /host/devices/d1/imports/IMP/cancel',
    ])
    expect(seen[3].data).toEqual({ memberId: 'm1' })
    expect(seen[4].data).toEqual({ removeAtGoLive: true })
    expect(seen[5].data).toEqual({ csv: 'pin,email\n501,a@b.c' })
  })

  it('cut-over, move, one template, command log', async () => {
    capture()
    await devicesApi.cutover('d1')
    await devicesApi.goLive('d1', false)
    await devicesApi.goLive('d1', true)
    await devicesApi.gymBioSyncStopped('d1')
    await devicesApi.move('d1', 'b2')
    await devicesApi.deleteTemplate('m1', 'bio-1')
    await devicesApi.commands('d1', 'failed')
    expect(seen.map((s) => `${s.method} ${s.url.replace(/^.*\/api\/v1/, '')}`)).toEqual([
      'get /host/devices/d1/cutover',
      'post /host/devices/d1/cutover/go-live',
      'post /host/devices/d1/cutover/go-live',
      'post /host/devices/d1/cutover/gymbiosync-stopped',
      'put /host/devices/d1/branch',
      'delete /host/members/m1/biometrics/bio-1',
      'get /host/devices/d1/commands?status=failed',
    ])
    expect(seen[1].data).toEqual({})
    expect(seen[2].data).toEqual({ removeUnmatched: true })
    expect(seen[4].data).toEqual({ branchId: 'b2' })
  })
})
