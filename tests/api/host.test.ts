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

describe('hostApi — branches', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists an organization’s branches and creates a branch on the /host routes', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {} } } as never)
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {} } } as never)

    await hostApi.getListingBranches('listing-1')
    await hostApi.getListingBranches('listing-1', true)
    await hostApi.createBranch({ branchName: 'Uptown', gymListingId: 'listing-1', packages: [{ name: 'Monthly', price: 5000 }] })

    expect(get.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['/host/listings/listing-1/branches', { params: undefined }],
      ['/host/listings/listing-1/branches', { params: { includeInactive: 'true' } }],
    ])
    expect(post).toHaveBeenCalledWith('/host/branches', {
      branchName: 'Uptown',
      gymListingId: 'listing-1',
      packages: [{ name: 'Monthly', price: 5000 }],
    })
  })
})
