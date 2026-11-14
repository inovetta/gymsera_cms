import { describe, it, expect, vi, beforeEach } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ default: http }))

import { subscriptionsApi, staffActionToast } from '@/lib/api/subscriptions'

// NEW-250: Cancel and Freeze in Subscription Detail answered 404 "Subscription not found": they
// called the MEMBER routes /subscriptions/:id/cancel|freeze, which only find the caller's own
// subscription (NEW-08). Staff use /subscriptions/staff/:id/cancel|freeze (gymsera_be), which answer
// 200 { status: 'EXECUTED' } or 202 { status: 'PENDING' } when the action needs approval.
describe('CMS staff Cancel / Freeze use the staff routes', () => {
  beforeEach(() => {
    Object.values(http).forEach((f) => f.mockReset())
    http.post.mockResolvedValue({ data: { success: true, data: { status: 'EXECUTED', subscription: { id: 's-1' } } } })
  })

  it('cancels at POST /subscriptions/staff/:id/cancel', async () => {
    await subscriptionsApi.cancelSubscription('s-1')
    expect(http.post).toHaveBeenCalledWith('/subscriptions/staff/s-1/cancel', {})
  })

  it('freezes at POST /subscriptions/staff/:id/freeze with the dates', async () => {
    await subscriptionsApi.freezeSubscription('s-1', { freezeFrom: '2026-11-15', freezeTo: '2026-11-22' })
    expect(http.post).toHaveBeenCalledWith('/subscriptions/staff/s-1/freeze', { freezeFrom: '2026-11-15', freezeTo: '2026-11-22' })
  })

  it('never calls the member routes', async () => {
    await subscriptionsApi.cancelSubscription('s-1')
    await subscriptionsApi.freezeSubscription('s-1', { freezeFrom: '2026-11-15', freezeTo: '2026-11-22' })
    const urls = http.post.mock.calls.map((c) => c[0])
    expect(urls.some((u: string) => /^\/subscriptions\/s-1\/(cancel|freeze)$/.test(u))).toBe(false)
  })

  it('says "sent for approval" when the API queued the action, not that it was done', () => {
    expect(staffActionToast({ status: 'PENDING' } as any, 'Subscription cancelled').title).toBe('Sent for approval')
    expect(staffActionToast({ status: 'EXECUTED' } as any, 'Subscription cancelled').title).toBe('Subscription cancelled')
  })
})
