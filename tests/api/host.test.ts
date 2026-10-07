import { describe, it, expect, vi, afterEach } from 'vitest'
import apiClient from '@/lib/api/client'
import { hostApi } from '@/lib/api/host'

describe('hostApi — the endpoints the mobile host console calls (Prompt 3B)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads the tenant-wide quota, the organization quota and the organizations', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {} } } as never)

    await hostApi.getBranchQuota()
    await hostApi.getBranchQuota('listing-1')
    await hostApi.getOrganizationQuota()
    await hostApi.getListings()

    expect(get.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['/host/branch-quota', { params: {} }],
      ['/host/branch-quota', { params: { organizationId: 'listing-1' } }],
      ['/host/organization-quota', undefined],
      ['/host/listings', undefined],
    ])
  })
})
