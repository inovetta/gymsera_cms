import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SubscriptionsPage from '@/app/(dashboard)/gym/subscriptions/page'
import { subscriptionsApi } from '@/lib/api/subscriptions'
import { startsOnApproval, pendingPlanChange } from '@/lib/subscriptions/dates'
import { ok } from '../fixtures/team'

/**
 * Phase 7 P9b item 6, BUG-31 on the CMS. Before: gym/subscriptions printed start → end for every row
 * (page.tsx Period column and detail Start / End), so a member's request still waiting for the host
 * showed dates that the API replaces on approval (subscription.service.js#datesOnApproval); a plan
 * change scheduled for the next cycle (pendingPlan, pendingChangeEffectiveDate) was not shown at all.
 */
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

const base = { userId: 'u1', branchId: 'b1', membershipPlanId: 'p1', autoRenew: false, plan: { name: 'Monthly' }, branch: { branchName: 'Uptown' } }
const request = { ...base, id: 's1', status: 'PENDING', createdByRole: 'MEMBER', startDate: '2026-10-20', endDate: '2026-11-20', user: { fullName: 'Ali Raza', email: 'ali@example.test' } }
const deskEntry = { ...base, id: 's2', status: 'PENDING', createdByRole: 'STAFF', startDate: '2026-11-05', endDate: '2026-12-05', user: { fullName: 'Sara Ahmed', email: 'sara@example.test' } }
const changing = {
  ...base, id: 's3', status: 'ACTIVE', createdByRole: 'MEMBER', startDate: '2026-10-01', endDate: '2026-11-01',
  pendingPlanId: 'p2', pendingPlan: { name: 'Quarterly' }, pendingChangeEffectiveDate: '2026-11-01',
  user: { fullName: 'Omar Khan', email: 'omar@example.test' },
}

beforeEach(() => {
  vi.spyOn(subscriptionsApi, 'getStaffSubscriptions').mockResolvedValue({ ...ok({ subscriptions: [request, deskEntry, changing] }), pagination: { totalPages: 1 } } as never)
  vi.spyOn(subscriptionsApi, 'getStaffSubscription').mockImplementation((async (id: string) =>
    ok({ subscription: [request, deskEntry, changing].find((s) => s.id === id), payments: [], invoice: null })) as never)
})
afterEach(() => vi.restoreAllMocks())

const mount = () =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SubscriptionsPage /></QueryClientProvider>)

const row = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement

describe('BUG-31 rule', () => {
  it('only a member request waiting for the host starts on approval', () => {
    expect(startsOnApproval(request)).toBe(true)
    expect(startsOnApproval(deskEntry)).toBe(false)
    expect(startsOnApproval(changing)).toBe(false)
    expect(pendingPlanChange(changing)).toEqual({ planName: 'Quarterly', date: '2026-11-01' })
    expect(pendingPlanChange(request)).toBeNull()
  })
})

describe('gym/subscriptions: real dates only', () => {
  it('a member request says it starts on approval, with no estimated dates', async () => {
    mount()
    const r = await row('Ali Raza')
    expect(within(r).getByText('Starts when approved')).toBeInTheDocument()
    expect(within(r).queryByText(/Oct 20, 2026|Nov 20, 2026/)).not.toBeInTheDocument()
  })

  it('a membership staff entered keeps its chosen dates', async () => {
    mount()
    const r = await row('Sara Ahmed')
    expect(within(r).getByText(/Nov 05, 2026/)).toBeInTheDocument()
  })

  it('a scheduled plan change shows its plan and the date the API stores', async () => {
    mount()
    const r = await row('Omar Khan')
    expect(within(r).getByText(/Changes to Quarterly on Nov 01, 2026/)).toBeInTheDocument()
  })

  it('the detail of a member request shows no start or end date', async () => {
    mount()
    fireEvent.click(await screen.findByText('Ali Raza'))
    expect(await screen.findByText('Starts when approved', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText('Start Date')).not.toBeInTheDocument()
    expect(screen.queryByText('End Date')).not.toBeInTheDocument()
  })
})
