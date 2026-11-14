import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CancelSubscriptionDialog } from '@/components/features/refunds/cancel-subscription-dialog'
import { refundsApi } from '@/lib/api/refunds'
import { subscriptionsApi } from '@/lib/api/subscriptions'

// NEW-253: the Subscription Detail Cancel asks "Return the payment?" only when the server allows it.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }))

const ok = (data: unknown) => ({ success: true, data }) as never
const baseQuote = {
  subscriptionId: 's-1', refundsAllowed: true, refundWindowDays: null, eligible: true, reasonCode: null, reason: null,
  currency: 'PKR', remainingRefundable: '3000.00', suggestedAmount: '2900.00', refundTier: 'DIRECT',
}

const renderDialog = (onDone = vi.fn()) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <CancelSubscriptionDialog subscriptionId="s-1" open onOpenChange={() => {}} onDone={onDone} />
    </QueryClientProvider>
  )
  return onDone
}

describe('Cancel subscription dialog (NEW-253)', () => {
  afterEach(() => { vi.restoreAllMocks(); toastSpy.mockClear() })

  it('policy on: offers the refund, prefilled with the suggestion, and sends it', async () => {
    vi.spyOn(refundsApi, 'quote').mockResolvedValue(ok(baseQuote))
    const cancel = vi.spyOn(subscriptionsApi, 'cancelSubscription').mockResolvedValue(ok({ status: 'EXECUTED', refund: { status: 'EXECUTED' } }))
    const onDone = renderDialog()
    fireEvent.click(await screen.findByRole('switch', { name: 'Return the payment?' }))
    expect(screen.getByLabelText('Amount (PKR)')).toHaveValue(2900)
    fireEvent.change(screen.getByLabelText('Amount (PKR)'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and refund' }))
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('s-1', { amount: 1500, reason: undefined }))
    expect(onDone).toHaveBeenCalled()
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Subscription cancelled and payment refunded' }))
  })

  it('an amount above the balance cannot be sent', async () => {
    vi.spyOn(refundsApi, 'quote').mockResolvedValue(ok(baseQuote))
    renderDialog()
    fireEvent.click(await screen.findByRole('switch', { name: 'Return the payment?' }))
    fireEvent.change(screen.getByLabelText('Amount (PKR)'), { target: { value: '3000.01' } })
    expect(screen.getByRole('button', { name: 'Cancel and refund' })).toBeDisabled()
  })

  it('policy off: no refund option; cancel sends no refund', async () => {
    vi.spyOn(refundsApi, 'quote').mockResolvedValue(ok({ ...baseQuote, eligible: false, refundsAllowed: false, reasonCode: 'refunds_disabled' }))
    const cancel = vi.spyOn(subscriptionsApi, 'cancelSubscription').mockResolvedValue(ok({ status: 'EXECUTED' }))
    renderDialog()
    const button = await screen.findByRole('button', { name: 'Cancel subscription' })
    await waitFor(() => expect(refundsApi.quote).toHaveBeenCalled())
    expect(screen.queryByText('Return the payment?')).not.toBeInTheDocument()
    fireEvent.click(button)
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('s-1', undefined))
  })

  it('a manager is told the refund goes for approval', async () => {
    vi.spyOn(refundsApi, 'quote').mockResolvedValue(ok({ ...baseQuote, refundTier: 'REQUEST' }))
    renderDialog()
    fireEvent.click(await screen.findByRole('switch', { name: 'Return the payment?' }))
    expect(screen.getByText(/sent for approval/)).toBeInTheDocument()
  })
})
