import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BillingPage from '@/app/(dashboard)/settings/billing/page'
import { hostBillingApi } from '@/lib/api/host-billing'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'

/**
 * Phase 7 P9, NEW-180 (lapse view, R-82) and R-86 (bank details from the API).
 * Before: a plan that ended read as "No active subscription yet" (the pre-P9 guard), with no word on
 * why or when the branches lock, and the bank account was typed into the page.
 * After: the mobile lapsed-plan card (my_subscription_screen.dart _LapsedPlanCard / _LapsedActions),
 * built only from the API's `lapse` block; bank details from GET /billing/bank-instructions.
 */
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))

const BANK = {
  bankName: 'Test Bank', accountTitle: 'GymsEra Test Account', accountNumber: '0000-1111', iban: 'PK00TEST0000000000000000',
  swiftCode: null, currency: 'PKR', instructions: 'Use your tenant ID as the reference.',
}
const lapsed = (over: Record<string, unknown> = {}, lapse: Record<string, unknown> = {}) => ({
  id: 'sub-1', status: 'EXPIRED', platform: 'MANUAL', branchCount: 3, amount: 4990, currency: 'PKR', billingCycle: 'MONTHLY',
  endDate: '2026-10-28T12:00:00Z', autoRenew: false, overQuotaCount: 0, entitled: false, paymentIssue: null,
  lapse: { status: 'EXPIRED', reason: 'expired', provider: 'MANUAL', manageUrl: null, endedAt: '2026-10-28T12:00:00Z', branchesLockAt: '2026-11-04T12:00:00Z', inGrace: true, remainingDays: 4, ...lapse },
  ...over,
})

let bank: ReturnType<typeof vi.spyOn>
const mount = (sub: unknown) => {
  vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(ok(sub) as never)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BillingPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't1', status: 'ACTIVE' } }) as never)
  vi.spyOn(hostBillingApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 0, activeBranches: 3, usedBranches: 3, buildableBranches: 0, remainingBranches: 0 }) as never)
  vi.spyOn(hostBillingApi, 'getCatalog').mockResolvedValue(ok({ plans: [] }) as never)
  bank = vi.spyOn(hostBillingApi, 'getBankInstructions').mockResolvedValue(ok(BANK) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('NEW-180: the lapsed plan, as the mobile My Subscription', () => {
  it('ended (bank transfer plan): when it ended, when the branches lock, and how to pay again', async () => {
    mount(lapsed())
    const card = await screen.findByTestId('lapsed-plan')
    expect(within(card).getByText('Plan ended')).toBeInTheDocument()
    expect(card).toHaveTextContent('Your plan ended on Oct 28, 2026.')
    expect(card).toHaveTextContent(/Your branches stay open until Nov 04, 2026\. After that they're locked/)
    expect(screen.queryByText('Current Plan')).toBeNull()
    expect(screen.queryByText(/Renews on/)).toBeNull()
    expect(screen.getByText('Bank Transfer Details')).toBeInTheDocument()
  })

  it('on hold at the App Store: the store fixes it, with its link', async () => {
    mount(lapsed({ status: 'ON_HOLD', platform: 'IOS' }, { status: 'ON_HOLD', reason: 'on_hold', provider: 'IOS', manageUrl: 'https://apps.apple.com/account/subscriptions' }))
    const card = await screen.findByTestId('lapsed-plan')
    expect(within(card).getByText('On hold')).toBeInTheDocument()
    expect(card).toHaveTextContent("The App Store couldn't take your renewal payment, so your plan is on hold.")
    expect(screen.getByRole('link', { name: 'Fix payment in App Store' })).toHaveAttribute('href', 'https://apps.apple.com/account/subscriptions')
  })

  it('paused in Google Play: "Resume in Google Play"', async () => {
    mount(lapsed({ status: 'PAUSED', platform: 'ANDROID' }, { status: 'PAUSED', reason: 'paused', provider: 'ANDROID', manageUrl: 'https://play.google.com/store/account/subscriptions' }))
    expect(await screen.findByRole('link', { name: 'Resume in Google Play' })).toBeInTheDocument()
  })

  it('refunded, branches already locked', async () => {
    mount(lapsed({ status: 'REVOKED', platform: 'IOS' }, { status: 'REVOKED', reason: 'refunded', provider: 'IOS', inGrace: false, branchesLockAt: null }))
    const card = await screen.findByTestId('lapsed-plan')
    expect(within(card).getByText('Refunded')).toBeInTheDocument()
    expect(card).toHaveTextContent('This plan was refunded, so it no longer covers your branches.')
    expect(card).toHaveTextContent('Your branches are locked: no new members, sales or plans.')
    expect(card).toHaveTextContent(/subscribe again from the GymsEra app/i)
  })
})

describe('R-86: platform bank details come from the API', () => {
  it('shows what GET /billing/bank-instructions returns, nothing typed into the page', async () => {
    mount(lapsed())
    expect(await screen.findByText('GymsEra Test Account')).toBeInTheDocument()
    expect(screen.getByText('PK00TEST0000000000000000')).toBeInTheDocument()
    expect(screen.getByText('Use your tenant ID as the reference.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Meezan|0247-0105817703|PK61MEZN/)
    expect(bank).toHaveBeenCalled()
  })

  it('no bank details configured: says to contact support, no empty rows', async () => {
    bank.mockResolvedValue(ok({ bankName: null, accountTitle: null, accountNumber: null, iban: null, swiftCode: null, currency: 'PKR', instructions: null }) as never)
    mount(lapsed())
    expect(await screen.findByText(/contact support@gymsera\.com for the bank details/i)).toBeInTheDocument()
    expect(screen.queryByText('Account Number:')).toBeNull()
  })
})
