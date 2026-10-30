import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BillingPage from '@/app/(dashboard)/settings/billing/page'
import { billingNoticesFrom } from '@/lib/billing-notices'
import { hostBillingApi } from '@/lib/api/host-billing'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'

vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))

// NEW-180 (safety guard until P9 builds the lapse view): since P7c (R-82) GET /host/subscription/current
// answers 200 with the ended plan (`entitled: false` and a `lapse` block) where it used to answer 404.
// Without this guard the CMS showed that row as the "Current Plan" ("Renews on", "Auto-renew On", an
// empty status badge for ON_HOLD / REVOKED / PAUSED), hid the bank transfer details a lapsed host needs,
// and worded the lapse as an over-quota countdown with "0 days left". Until P9, a plan that does not
// entitle reads exactly as before P7c: no current plan, no notices.

const lapsed = (status: string) => ({
  id: 'sub-1', status, platform: 'IOS', branchCount: 3, amount: 4990, currency: 'PKR', billingCycle: 'MONTHLY',
  endDate: '2026-10-28', autoRenew: true, overQuotaCount: 3, entitled: false, paymentIssue: null,
  lapse: { status, reason: 'refunded', provider: 'IOS', manageUrl: null, inGrace: true, remainingDays: 5 },
})

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BillingPage />
    </QueryClientProvider>
  )

afterEach(() => vi.restoreAllMocks())

describe('NEW-180: a plan that does not entitle is never shown as the current plan', () => {
  it.each(['EXPIRED', 'ON_HOLD', 'REVOKED', 'PAUSED'])('%s: no "Current Plan", no renewal date, bank transfer offered', async (status) => {
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't1', status: 'ACTIVE' } }) as never)
    vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(ok(lapsed(status)) as never)
    vi.spyOn(hostBillingApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 0, activeBranches: 3, usedBranches: 3, buildableBranches: 0, remainingBranches: 0 }) as never)
    vi.spyOn(hostBillingApi, 'getCatalog').mockResolvedValue(ok({ plans: [] }) as never)

    renderPage()

    expect(await screen.findByText(/No active subscription/i)).toBeInTheDocument()
    expect(screen.queryByText('Current Plan')).toBeNull()
    expect(screen.queryByText(/Renews on/)).toBeNull()
    expect(screen.queryByTestId('billing-notices')).toBeNull()
    expect(screen.getByText('Bank Transfer Details')).toBeInTheDocument()
  })

  it('notices: nothing for a plan that does not entitle (no "0 days left" countdown)', () => {
    expect(billingNoticesFrom(lapsed('EXPIRED'))).toEqual([])
  })

  it('an entitling plan is unchanged: still the current plan with its notices', async () => {
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't1', status: 'ACTIVE' } }) as never)
    vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(
      ok({ ...lapsed('ACTIVE'), entitled: true, lapse: null, overQuotaCount: 1, overQuotaGraceRemainingDays: 4 }) as never
    )
    vi.spyOn(hostBillingApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 3, activeBranches: 4, usedBranches: 4, buildableBranches: 0, remainingBranches: 0 }) as never)
    vi.spyOn(hostBillingApi, 'getCatalog').mockResolvedValue(ok({ plans: [] }) as never)

    renderPage()

    expect(await screen.findByText('Current Plan')).toBeInTheDocument()
    expect(screen.getByTestId('billing-notices')).toBeInTheDocument()
    expect(screen.queryByText(/No active subscription/i)).toBeNull()
  })
})
