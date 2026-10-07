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

describe('hostApi — delete and restore', () => {
  afterEach(() => vi.restoreAllMocks())

  it('deletes with the credentials in the body and restores on the /host routes', async () => {
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { success: true, data: null } } as never)
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {} } } as never)

    await hostApi.deleteBranch('b1', { password: 'placeholder-pass' })
    await hostApi.deleteBranch('b1', { password: 'placeholder-pass', confirmOrganizationDeletion: true })
    await hostApi.restoreBranch('b2')

    expect(del).toHaveBeenNthCalledWith(1, '/host/branches/b1', { data: { password: 'placeholder-pass' } })
    expect(del).toHaveBeenNthCalledWith(2, '/host/branches/b1', {
      data: { password: 'placeholder-pass', confirmOrganizationDeletion: true },
    })
    expect(post).toHaveBeenCalledWith('/host/branches/b2/restore')
  })
})

describe('hostApi — new organization', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates an organization, moves a branch into it and undoes it on the /host routes', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {} } } as never)
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {} } } as never)
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { success: true, data: null } } as never)

    await hostApi.getAllBranches()
    await hostApi.createListing({ gymName: 'Fit Hub', gymDescription: 'd', genderType: 'MIXED', branchSource: 'none' })
    await hostApi.moveBranch('b1', 'listing-2')
    await hostApi.moveBranch('b1', 'listing-2', true)
    await hostApi.deleteListing('listing-2')

    expect(get).toHaveBeenCalledWith('/host/branches')
    expect(post).toHaveBeenNthCalledWith(1, '/host/listings', { gymName: 'Fit Hub', gymDescription: 'd', genderType: 'MIXED', branchSource: 'none' })
    expect(post).toHaveBeenNthCalledWith(2, '/host/branches/b1/move', { targetListingId: 'listing-2' })
    expect(post).toHaveBeenNthCalledWith(3, '/host/branches/b1/move', { targetListingId: 'listing-2', confirmOrganizationDeletion: true })
    expect(del).toHaveBeenCalledWith('/host/listings/listing-2')
  })
})
