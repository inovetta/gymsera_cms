import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BillingPlansPage from '@/app/(dashboard)/admin/billing-plans/page'
import { billingPlansApi } from '@/lib/api/billing-plans'
import { ok } from '../fixtures/team'

// BILL-15: the admin plans screen says whether the store's price has been checked.
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))

const plan = (id: string, branchCount: number, priceVerification?: unknown) => ({
  id, branchCount, monthlyPrice: 1500, annualPrice: 15000, currency: 'PKR', isActive: true, sortOrder: branchCount,
  iosSyncStatus: 'SYNCED', androidSyncStatus: 'SYNCED', stripeSyncStatus: 'NOT_CONFIGURED',
  ...(priceVerification ? { priceVerification } : {}),
})

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BillingPlansPage />
    </QueryClientProvider>
  )
}

describe('Admin billing plans: price check badges (BILL-15)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows Android verified / mismatch / admin-attested per plan, and iOS as admin-attested', async () => {
    vi.spyOn(billingPlansApi, 'getPlans').mockResolvedValue(ok([
      plan('p1', 1, { android: { status: 'VERIFIED', checkedAt: '2026-10-20T03:40:00Z' }, ios: { status: 'ADMIN_ATTESTED', checkedAt: null } }),
      plan('p2', 2, { android: { status: 'MISMATCH', checkedAt: '2026-10-20T03:40:00Z', mismatchCount: 1 }, ios: { status: 'ADMIN_ATTESTED', checkedAt: null } }),
      plan('p3', 3, { android: { status: 'ADMIN_ATTESTED', checkedAt: null }, ios: { status: 'ADMIN_ATTESTED', checkedAt: null } }),
    ]) as never)
    renderPage()

    const cards = (await screen.findAllByText(/\d+ branch/)).map((el) => el.closest('div[class*="overflow-hidden"]') as HTMLElement)
    const [one, two, three] = cards
    expect(within(one).getByTestId('price-check-android')).toHaveTextContent('Android prices: verified')
    expect(within(two).getByTestId('price-check-android')).toHaveTextContent('Android prices: mismatch')
    expect(within(three).getByTestId('price-check-android')).toHaveTextContent('Android prices: admin-attested')
    for (const card of [one, two, three]) {
      expect(within(card).getByTestId('price-check-ios')).toHaveTextContent('iOS prices: admin-attested')
    }
  })

  it('an older API without priceVerification shows admin-attested, never "verified"', async () => {
    vi.spyOn(billingPlansApi, 'getPlans').mockResolvedValue(ok([plan('p1', 1)]) as never)
    renderPage()
    expect(await screen.findByTestId('price-check-android')).toHaveTextContent('Android prices: admin-attested')
    expect(screen.queryByText(/prices: verified/)).not.toBeInTheDocument()
  })

  it('the badge explains itself and shows the check date', async () => {
    vi.spyOn(billingPlansApi, 'getPlans').mockResolvedValue(ok([
      plan('p1', 1, { android: { status: 'VERIFIED', checkedAt: '2026-10-20T03:40:00Z' }, ios: { status: 'ADMIN_ATTESTED', checkedAt: null } }),
    ]) as never)
    renderPage()
    const badge = await screen.findByTestId('price-check-android')
    expect(badge.getAttribute('title')).toMatch(/store holds this price/i)
    expect(badge.getAttribute('title')).toMatch(/last checked/i)
  })
})
