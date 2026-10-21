import { describe, it, expect, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ default: http }))

import { usersApi } from '@/lib/api/users'

// gymsera_be users.routes.js: POST /users/:id/status { status, reason? }. Admin password reset is
// POST /users/:id/password.
describe('CMS usersApi', () => {
  it('sets a member status with POST /users/:id/status', async () => {
    http.post.mockResolvedValue({ data: { success: true, data: { user: { id: 'u-1' } } } })
    await usersApi.updateUserStatus('u-1', { status: 'SUSPENDED', reason: 'unpaid' })
    expect(http.post).toHaveBeenCalledWith('/users/u-1/status', { status: 'SUSPENDED', reason: 'unpaid' })
    expect(http.patch).not.toHaveBeenCalled()
  })
})
