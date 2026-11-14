import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemberRefundRequests } from '@/components/features/refunds/member-refund-requests'
import { refundsApi } from '@/lib/api/refunds'

// NEW-253: Approvals › Member refunds. Approve sends the (possibly lowered) amount; reject needs a reason.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }))

const ok = (data: unknown) => ({ success: true, data }) as never
const row = {
  id: 'r-1', subscriptionId: 's-1', paymentId: 'p-1', userId: 'u-1', branchId: 'b-1', status: 'PENDING',
  currency: 'PKR', suggestedAmount: '2900.00', approvedAmount: null, reason: 'Injury', decidedBy: null,
  decidedAt: null, decisionReason: null, createdAt: '2026-11-14T10:00:00Z',
}
const renderList = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={queryClient}><MemberRefundRequests /></QueryClientProvider>)
}

describe('Member refund requests (NEW-253)', () => {
  afterEach(() => { vi.restoreAllMocks(); toastSpy.mockClear() })

  it('approve sends the amount (lowered here); above the asked amount is refused in the form', async () => {
    vi.spyOn(refundsApi, 'listRequests').mockResolvedValue(ok({ requests: [row] }))
    const decide = vi.spyOn(refundsApi, 'decide').mockResolvedValue(ok({ request: { ...row, status: 'APPROVED' } }))
    renderList()
    expect(await screen.findByText('“Injury”')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const amount = screen.getByLabelText('Amount (PKR)')
    fireEvent.change(amount, { target: { value: '2900.01' } })
    expect(screen.getByRole('button', { name: 'Approve refund' })).toBeDisabled()
    fireEvent.change(amount, { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve refund' }))
    await waitFor(() => expect(decide).toHaveBeenCalledWith('r-1', { decision: 'APPROVE', amount: 2000, reason: undefined }))
  })

  it('reject needs a reason and sends it', async () => {
    vi.spyOn(refundsApi, 'listRequests').mockResolvedValue(ok({ requests: [row] }))
    const decide = vi.spyOn(refundsApi, 'decide').mockResolvedValue(ok({ request: { ...row, status: 'REJECTED' } }))
    renderList()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const confirm = screen.getAllByRole('button', { name: 'Reject' }).at(-1)!
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Outside policy' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(decide).toHaveBeenCalledWith('r-1', { decision: 'REJECT', reason: 'Outside policy' }))
  })

  it('empty list says so', async () => {
    vi.spyOn(refundsApi, 'listRequests').mockResolvedValue(ok({ requests: [] }))
    renderList()
    expect(await screen.findByText('No refund requests')).toBeInTheDocument()
  })
})
