import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/client', () => ({ default: { post, get: vi.fn() } }))

import { authApi } from '@/lib/api/auth'

// The API serves POST /auth/password-reset/request { email } and /confirm { email, code, password }
// (gymsera_be src/validators/auth.validator.js). There is no /auth/forgot-password or /auth/reset-password.
describe('CMS authApi password reset hits the routes the API has', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { success: true } })
  })

  it('requests a code at /auth/password-reset/request', async () => {
    await authApi.requestPasswordReset({ email: 'a@b.co' })
    expect(post).toHaveBeenCalledWith('/auth/password-reset/request', { email: 'a@b.co' })
  })

  it('confirms at /auth/password-reset/confirm with { email, code, password }', async () => {
    await authApi.confirmPasswordReset({ email: 'a@b.co', code: '123456', password: 'Str0ng!pass' })
    expect(post).toHaveBeenCalledWith('/auth/password-reset/confirm', {
      email: 'a@b.co',
      code: '123456',
      password: 'Str0ng!pass',
    })
  })
})
