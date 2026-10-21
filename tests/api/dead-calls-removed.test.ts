import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

import { usersApi } from '@/lib/api/users'
import { trainersApi } from '@/lib/api/trainers'

// These called routes the API does not have (PATCH /users/:id, POST /users/:id/reset-password,
// GET /gyms/trainers/:id) and no screen used them. A screen that needs them later should call the
// real route: PUT /users/:id, POST /users/:id/password, GET /trainers.
describe('CMS api: calls to routes the API does not have are gone', () => {
  it('usersApi has no updateUser or resetUserPassword', () => {
    const api = usersApi as Record<string, unknown>
    expect(api.updateUser).toBeUndefined()
    expect(api.resetUserPassword).toBeUndefined()
  })

  it('trainersApi has no single-trainer read', () => {
    expect((trainersApi as Record<string, unknown>).getTrainer).toBeUndefined()
  })
})
