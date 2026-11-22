import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SubscriptionTab } from '@/components/features/admin-organization/subscription-tab'
import { adminApi } from '@/lib/api/admin'
import { ok } from '../fixtures/team'

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

/**
 * NEW-281 (R-114): a store test purchase (environment SANDBOX) is labelled "Test purchase (Sandbox)"
 * on the admin tenant Subscription tab, so nobody mistakes it for a paid plan: it never makes the gym
 * live for travellers (R-87) and a bank-transfer plan replaces it.
 */
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString()
const row = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1', organizationId: 't1', platformPackageId: null, platform: 'IOS', branchCount: 1,
  startDate: inDays(-1), endDate: inDays(1), amount: 2000, billingCycle: 'MONTHLY', status: 'ACTIVE',
  autoRenew: true, paymentStatus: 'PAID', createdAt: inDays(-1), ...over,
})

const renderTab = (subs: unknown[]) => {
  vi.spyOn(adminApi, 'getSubscriptions').mockResolvedValue(ok({ subscriptions: subs }) as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubscriptionTab organizationId="t1" />
    </QueryClientProvider>
  )
}

describe('NEW-281: SANDBOX rows are labelled as test purchases', () => {
  afterEach(() => vi.restoreAllMocks())

  it('labels an Apple or Google SANDBOX row "Test purchase (Sandbox)"', async () => {
    renderTab([row({ id: 'a', environment: 'SANDBOX' }), row({ id: 'b', platform: 'ANDROID', environment: 'SANDBOX' })])
    expect(await screen.findAllByText('Test purchase (Sandbox)')).toHaveLength(2)
  })

  it('shows no label on a real store purchase or a bank-transfer plan', async () => {
    renderTab([row({ id: 'a', environment: 'PRODUCTION' }), row({ id: 'b', platform: 'MANUAL', environment: null })])
    await screen.findByText(/subscription history/i)
    expect(screen.queryByText('Test purchase (Sandbox)')).toBeNull()
  })
})
