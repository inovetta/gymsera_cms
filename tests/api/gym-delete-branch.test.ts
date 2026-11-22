import { describe, it, expect, vi, afterEach } from 'vitest'
import apiClient from '@/lib/api/client'
import { organizationsApi } from '@/lib/api/organizations'

describe('organizationsApi.deleteBranch (NEW-35 re-auth)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the password in the request body (axios data config)', async () => {
    const mockResponse = { success: true, message: 'Branch deleted', data: null }
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: mockResponse } as never)

    const res = await organizationsApi.deleteBranch('branch-42', { password: 'test-password-123' })

    expect(deleteSpy).toHaveBeenCalledWith('/organizations/me/branches/branch-42', {
      data: {
        password: 'test-password-123',
      },
    })
    expect(res).toEqual(mockResponse)
  })

  it('sends social re-auth tokens if provided', async () => {
    const mockResponse = { success: true, message: 'Branch deleted', data: null }
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: mockResponse } as never)

    await organizationsApi.deleteBranch('branch-99', {
      provider: 'GOOGLE',
      idToken: 'google-id-token',
      confirmBusinessDeletion: true,
    })

    expect(deleteSpy).toHaveBeenCalledWith('/organizations/me/branches/branch-99', {
      data: {
        provider: 'GOOGLE',
        idToken: 'google-id-token',
        confirmBusinessDeletion: true,
      },
    })
  })
})
