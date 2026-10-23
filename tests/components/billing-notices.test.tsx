import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BillingNotices } from '@/components/features/billing-notices'
import { billingNoticesFrom } from '@/lib/billing-notices'
import { hostBillingApi } from '@/lib/api/host-billing'
import { hostApi } from '@/lib/api/host'
import { ok } from '../fixtures/team'

vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))

// NEW-21 / NEW-32 (spec R-51): the host sees what GET /host/subscription/current says about the plan
// (failed renewal, pay-later countdown, branches over the plan with days left, a second subscription
// still billing). Same facts and wording as the mobile BillingNoticesSection; the server decides, this words them.

describe('billingNoticesFrom', () => {
  it('nothing wrong: no notices', () => {
    expect(billingNoticesFrom({ status: 'ACTIVE', overQuotaCount: 0, duplicateBilling: false })).toEqual([])
  })

  it('pay later: days left and the date, a warning', () => {
    const [n] = billingNoticesFrom({ paymentIssue: { provider: 'MANUAL', payBy: '2026-12-10', daysLeft: 5 } })
    expect(n.title).toBe('Payment due')
    expect(n.message).toContain('5 days')
    expect(n.message).toContain('2026-12-10')
    expect(n.severity).toBe('warning')
  })

  it('pay later: critical at 2 days or fewer, "today" at 0, singular at 1', () => {
    expect(billingNoticesFrom({ paymentIssue: { provider: 'MANUAL', payBy: 'x', daysLeft: 2 } })[0].severity).toBe('critical')
    expect(billingNoticesFrom({ paymentIssue: { provider: 'MANUAL', payBy: 'x', daysLeft: 0 } })[0].message).toContain('today')
    expect(billingNoticesFrom({ paymentIssue: { provider: 'MANUAL', payBy: 'x', daysLeft: 1 } })[0].message).toContain('1 day ')
  })

  it('failed store renewal: keeps the plan while the store retries, with the store link', () => {
    const [n] = billingNoticesFrom({ paymentIssue: { provider: 'ANDROID', manageUrl: 'https://play.google.com/store/account/subscriptions?sku=x' } })
    expect(n.title).toBe('Payment problem')
    expect(n.message).toMatch(/retr/)
    expect(n.message).toContain('Google Play')
    expect(n.actionLabel).toBe('Fix payment')
    expect(n.actionUrl).toMatch(/^https:\/\/play\.google\.com\//)
  })

  it('a manage link that is not https is never offered', () => {
    const [n] = billingNoticesFrom({ paymentIssue: { provider: 'IOS', manageUrl: 'javascript:alert(1)' } })
    expect(n.actionUrl).toBeUndefined()
  })

  it('branches over the plan: days left, then the locked wording', () => {
    const [soon] = billingNoticesFrom({ overQuotaCount: 2, overQuotaGraceRemainingDays: 4, isOverQuotaGraceExpired: false })
    expect(soon.title).toBe("Over your plan's branch capacity")
    expect(soon.message).toContain('2 branches')
    expect(soon.message).toContain('4 days')
    const [locked] = billingNoticesFrom({ overQuotaCount: 1, isOverQuotaGraceExpired: true })
    expect(locked.title).toBe('Branches over your plan are locked')
    expect(locked.severity).toBe('critical')
  })

  it('a second subscription still billing', () => {
    const [n] = billingNoticesFrom({ duplicateBilling: true, duplicateBillingPlatform: 'IOS', duplicateBillingManageUrl: 'https://apps.apple.com/account/subscriptions' })
    expect(n.title).toBe('You may be billed twice')
    expect(n.message).toContain('App Store')
    expect(n.actionUrl).toBe('https://apps.apple.com/account/subscriptions')
  })

  it('a smaller plan is scheduled and covers fewer branches than are active: choose in the app', () => {
    const [n] = billingNoticesFrom(
      { pendingChange: { branchCount: 2, keepBranchIds: [], appliedAt: null, effectiveAt: '2026-12-01' } },
      { activeBranches: 4 }
    )
    expect(n.title).toBe('Choose which branches to keep')
    expect(n.message).toContain('2 branches')
    expect(n.message).toContain('4 active')
    expect(n.message).toMatch(/GymsEra app/)
  })
})

describe('BillingNotices', () => {
  afterEach(() => vi.restoreAllMocks())

  const mount = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <BillingNotices />
      </QueryClientProvider>
    )
  }

  it('shows each notice with an alert role and the action link', async () => {
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 2, usedBranches: 2, remainingBranches: 0, activeBranches: 2, buildableBranches: 0, overQuotaCount: 0 }) as never)
    vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(
      ok({ paymentIssue: { provider: 'STRIPE', manageUrl: 'https://billing.stripe.com/p/session/x' }, overQuotaCount: 1, overQuotaGraceRemainingDays: 1 }) as never
    )
    mount()

    expect(await screen.findByText('Payment problem')).toBeInTheDocument()
    expect(screen.getByText("Over your plan's branch capacity")).toBeInTheDocument()
    expect(screen.getAllByRole('alert').length).toBe(2)
    expect(screen.getByRole('link', { name: 'Fix payment' })).toHaveAttribute('href', 'https://billing.stripe.com/p/session/x')
  })

  it('renders nothing when the plan is fine', async () => {
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 2, usedBranches: 1, remainingBranches: 1, activeBranches: 1, buildableBranches: 1, overQuotaCount: 0 }) as never)
    const spy = vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(ok({ status: 'ACTIVE' }) as never)
    const { container } = mount()
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the plan cannot be read (the page shows its own error)', async () => {
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 0, usedBranches: 0, remainingBranches: 0, activeBranches: 0, buildableBranches: 0, overQuotaCount: 0 }) as never)
    const spy = vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockRejectedValue({ response: { status: 404 } })
    const { container } = mount()
    await vi.waitFor(() => expect(spy).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
