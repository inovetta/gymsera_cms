import { describe, it, expect, vi, beforeEach } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ default: http }))

import { trainersApi } from '@/lib/api/trainers'

// The API serves /trainers (gymsera_be src/routes/trainers.routes.js): GET /, POST /, PATCH /:id,
// POST /:id/assign. There is no /gyms/trainers and no toggle-status; status is a field of PATCH /:id.
describe('CMS trainersApi uses the /trainers routes', () => {
  beforeEach(() => {
    Object.values(http).forEach((f) => f.mockReset())
    Object.values(http).forEach((f) => f.mockResolvedValue({ data: { success: true, data: { trainers: [], trainer: {} } } }))
  })

  it('lists at GET /trainers', async () => {
    await trainersApi.getTrainers({ page: 2 })
    expect(http.get).toHaveBeenCalledWith('/trainers', { params: { page: 2 } })
  })

  it('creates at POST /trainers with the person user id', async () => {
    await trainersApi.createTrainer({ userId: 'u-1', specialization: 'Yoga', bio: 'b', yearsExperience: 3 })
    expect(http.post).toHaveBeenCalledWith('/trainers', { userId: 'u-1', specialization: 'Yoga', bio: 'b', yearsExperience: 3 })
  })

  it('updates at PATCH /trainers/:id', async () => {
    await trainersApi.updateTrainer('t-1', { specialization: 'Boxing' })
    expect(http.patch).toHaveBeenCalledWith('/trainers/t-1', { specialization: 'Boxing' })
  })

  it('changes status with PATCH /trainers/:id { status }', async () => {
    await trainersApi.setTrainerStatus('t-1', 'INACTIVE')
    expect(http.patch).toHaveBeenCalledWith('/trainers/t-1', { status: 'INACTIVE' })
  })

  it('assigns at POST /trainers/:id/assign', async () => {
    await trainersApi.assignTrainer('t-1', { branchId: 'b-1' })
    expect(http.post).toHaveBeenCalledWith('/trainers/t-1/assign', { branchId: 'b-1' })
  })

  it('no longer has the toggle-status call (the route does not exist)', () => {
    expect((trainersApi as Record<string, unknown>).toggleTrainerStatus).toBeUndefined()
    expect((trainersApi as Record<string, unknown>).getTrainer).toBeUndefined()
  })
})
