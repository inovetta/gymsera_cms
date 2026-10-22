import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SubscriptionTab } from '@/components/features/admin-tenant/subscription-tab'
import { adminApi } from '@/lib/api/admin'
import apiClient from '@/lib/api/client'
import { ok } from '../fixtures/team'

const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

/** NEW-20: admin "Verify payment" for a pay-later tenant (BILL-13 route: POST /admin/tenants/:id/subscriptions/:subId/verify-payment). */

const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString()
const row = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  tenantId: 't1',
  platformPackageId: null,
  platform: 'MANUAL',
  branchCount: 2,
  startDate: inDays(-9),
  endDate: inDays(5),
  amount: 12000,
  billingCycle: 'MONTHLY',
  status: 'GRACE',
  autoRenew: false,
  paymentStatus: 'PENDING',
  createdAt: inDays(-9),
  ...over,
})

const renderTab = (subs: unknown[]) => {
  vi.spyOn(adminApi, 'getTenantSubscriptions').mockResolvedValue(ok({ subscriptions: subs }) as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubscriptionTab tenantId="t1" />
    </QueryClientProvider>
  )
}

describe('NEW-20: Verify payment for pay-later tenants', () => {
  afterEach(() => { vi.restoreAllMocks(); toast.mockClear() })

  it('shows the button, the deadline and the amount on a MANUAL row waiting for payment', async () => {
    renderTab([row()])
    expect(await screen.findByRole('button', { name: /verify payment/i })).toBeInTheDocument()
    expect(screen.getByText(/waiting for the bank transfer/i)).toBeInTheDocument()
    expect(screen.getByText(/5 days left/i)).toBeInTheDocument()
    expect(screen.getByText(/lapses.*if no payment is verified/i)).toBeInTheDocument()
  })

  it('shows no button on active, store-backed or non-grace rows', async () => {
    renderTab([
      row({ id: 'a', status: 'ACTIVE', paymentStatus: 'PAID' }),
      row({ id: 'b', platform: 'IOS' }),
      row({ id: 'c', status: 'EXPIRED' }),
    ])
    await screen.findByText(/subscription history/i)
    await waitFor(() => expect(screen.queryAllByText(/payment:/i).length).toBe(3))
    expect(screen.queryByRole('button', { name: /verify payment/i })).toBeNull()
  })

  it('says the plan is overdue when the pay-by date has passed', async () => {
    renderTab([row({ endDate: inDays(-2) })])
    expect(await screen.findByText(/pay-by date passed 2 days ago/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verify payment/i })).toBeInTheDocument()
  })

  it('asks for confirmation naming the amount, then posts the bank reference and refreshes the tenant', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: ok({ subscription: row({ status: 'ACTIVE' }) }) } as never)
    renderTab([row()])
    fireEvent.click(await screen.findByRole('button', { name: /verify payment/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/12,000/)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText(/bank reference/i), { target: { value: 'TXN-884' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /confirm.*received/i }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/admin/tenants/t1/subscriptions/sub-1/verify-payment', { bankTransferRef: 'TXN-884' })
    await waitFor(() => expect(adminApi.getTenantSubscriptions).toHaveBeenCalledTimes(2))
  })

  it('sends no bank reference when the field is empty, and only once however often it is clicked', async () => {
    const post = vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise(() => {}))
    renderTab([row()])
    fireEvent.click(await screen.findByRole('button', { name: /verify payment/i }))
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: /confirm.*received/i })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/admin/tenants/t1/subscriptions/sub-1/verify-payment', {})
  })

  it('shows the server message when the row can no longer be verified', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { data: { message: 'Only a pay-later plan that is waiting for payment can be verified.' } } })
    renderTab([row()])
    fireEvent.click(await screen.findByRole('button', { name: /verify payment/i }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /confirm.*received/i }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive',
      description: 'Only a pay-later plan that is waiting for payment can be verified.',
    })))
  })
})
