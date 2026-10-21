import { describe, it, expect, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ default: http }))

import { plansApi } from '@/lib/api/plans'

// gymsera_be membership-plans.routes.js: POST /membership-plans/:id/status toggles ACTIVE / INACTIVE.
describe('CMS plansApi.togglePlanStatus', () => {
  it('posts to /membership-plans/:id/status (there is no PATCH …/toggle-status route)', async () => {
    http.post.mockResolvedValue({ data: { success: true, data: { plan: { id: 'p-1', status: 'INACTIVE' } } } })
    const res = await plansApi.togglePlanStatus('p-1')
    expect(http.post).toHaveBeenCalledWith('/membership-plans/p-1/status')
    expect(http.patch).not.toHaveBeenCalled()
    expect(res.data?.plan.status).toBe('INACTIVE')
  })
})
