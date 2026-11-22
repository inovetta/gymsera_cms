import { describe, it, expect, vi, afterEach } from 'vitest'
import apiClient from '@/lib/api/client'
import { hostApi } from '@/lib/api/host'

describe('hostApi — the endpoints the mobile host console calls (Prompt 3B)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads the organization pool, the business quota and the businesses', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {} } } as never)

    await hostApi.getBranchQuota()
    await hostApi.getBranchQuota('biz-1')
    await hostApi.getBusinessQuota()
    await hostApi.getBusinesses()

    expect(get.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['/host/branch-quota', { params: {} }],
      ['/host/branch-quota', { params: { businessId: 'biz-1' } }],
      ['/host/business-quota', undefined],
      ['/host/businesses', undefined],
    ])
  })
})

describe('hostApi — branches', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists a business’s branches and creates a branch on the /host routes', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {} } } as never)
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {} } } as never)

    await hostApi.getBusinessBranches('biz-1')
    await hostApi.getBusinessBranches('biz-1', true)
    await hostApi.createBranch({ branchName: 'Uptown', businessId: 'biz-1', packages: [{ name: 'Monthly', price: 5000 }] })

    expect(get.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['/host/businesses/biz-1/branches', { params: undefined }],
      ['/host/businesses/biz-1/branches', { params: { includeInactive: 'true' } }],
    ])
    expect(post).toHaveBeenCalledWith('/host/branches', {
      branchName: 'Uptown',
      businessId: 'biz-1',
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
    await hostApi.deleteBranch('b1', { password: 'placeholder-pass', confirmBusinessDeletion: true })
    await hostApi.restoreBranch('b2')

    expect(del).toHaveBeenNthCalledWith(1, '/host/branches/b1', { data: { password: 'placeholder-pass' } })
    expect(del).toHaveBeenNthCalledWith(2, '/host/branches/b1', {
      data: { password: 'placeholder-pass', confirmBusinessDeletion: true },
    })
    expect(post).toHaveBeenCalledWith('/host/branches/b2/restore')
  })
})

// P5b item 8 (R-81) / NEW-167: the move route is gone and an organization starts with its first branch
// (NEW-168), so the client has no move, no bare organization and no rollback delete.
describe('hostApi — new business', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates a business with its held first branch on POST /host/businesses', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {} } } as never)
    const body = { businessName: 'Fit Hub', businessDescription: 'd', genderType: 'MIXED', cityId: 7, address: 'x', packages: [{ name: 'Monthly', price: 3000 }] }
    await hostApi.createBusiness(body)
    expect(post).toHaveBeenCalledWith('/host/businesses', body)
  })

  it('has no move and no bare-business rollback', () => {
    const api = hostApi as Record<string, unknown>
    expect(api.moveBranch).toBeUndefined()
    expect(api.deleteListing).toBeUndefined()
  })

  it('pauses and resumes a branch on the P5b routes', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {} } } as never)
    await hostApi.pauseBranch('b1')
    await hostApi.resumeBranch('b1')
    expect(post).toHaveBeenNthCalledWith(1, '/host/branches/b1/pause')
    expect(post).toHaveBeenNthCalledWith(2, '/host/branches/b1/resume')
  })
})
