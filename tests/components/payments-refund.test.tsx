import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PaymentsPage from '@/app/(dashboard)/gym/payments/page'
import { paymentsApi } from '@/lib/api/payments'
import { gymApi } from '@/lib/api/gym'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, withPermissions } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: 'MEMBER' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: false,
    isBranchManager: false,
  }),
}))

const httpError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

const completed = {
  id: 'p9', userId: 'u1', paymentFor: 'MEMBERSHIP', amount: 3000, currency: 'PKR', method: 'CASH',
  status: 'COMPLETED', branchId: 'branch-1', createdAt: '2026-10-01T10:00:00.000Z', user: { fullName: 'Ali Raza' },
}

const direct = withPermissions(frontDeskContext, ['payments.refund', 'payments.refund.direct'])
const needsApproval = withPermissions(frontDeskContext, ['payments.refund'])

let refundPayment: ReturnType<typeof vi.spyOn>

const renderPage = (context: MyContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [{ id: 'branch-1', branchName: 'Uptown' }] }) as never)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaymentsPage />
    </QueryClientProvider>
  )
}

const openRefund = async (title: string) => {
  await screen.findByText('Ali Raza')
  fireEvent.click(screen.getByTitle(title))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Moved away' } })
  return dialog
}

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(paymentsApi, 'getPayments').mockResolvedValue(ok({ payments: [completed] }) as never)
  refundPayment = vi.spyOn(paymentsApi, 'refundPayment').mockResolvedValue({ status: 200, data: { success: true, data: {} } } as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Refunds (PAY-07)', () => {
  it('allowed (direct): a full refund posts the reason with an Idempotency-Key and says it was issued', async () => {
    renderPage(direct)
    const dialog = await openRefund('Refund')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refund' }))

    await waitFor(() => expect(refundPayment).toHaveBeenCalledWith('p9', { reason: 'Moved away' }, expect.any(String)))
    expect(screen.queryByText('Submitted for approval')).not.toBeInTheDocument()
  })

  it('a partial refund sends the amount with at most two decimals', async () => {
    renderPage(direct)
    const dialog = await openRefund('Refund')
    fireEvent.click(within(dialog).getByLabelText(/Refund part of it/))
    fireEvent.change(within(dialog).getByLabelText(/Amount to refund/), { target: { value: '500.50' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refund' }))

    await waitFor(() => expect(refundPayment).toHaveBeenCalled())
    expect(refundPayment.mock.calls[0][1]).toEqual({ reason: 'Moved away', amount: 500.5 })
  })

  it('a bad partial amount is refused before any request', async () => {
    renderPage(direct)
    const dialog = await openRefund('Refund')
    fireEvent.click(within(dialog).getByLabelText(/Refund part of it/))
    fireEvent.change(within(dialog).getByLabelText(/Amount to refund/), { target: { value: '1.234' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refund' }))

    expect(await within(dialog).findByText(/at most two decimals/)).toBeInTheDocument()
    expect(refundPayment).not.toHaveBeenCalled()
  })

  it('202 pending: shows the shared notice with a link to the approvals inbox, never "refunded"', async () => {
    refundPayment.mockResolvedValue({
      status: 202,
      data: { success: true, data: { approvalRequestId: 'req-1', status: 'PENDING', summary: 'Refund payment p9: full — Moved away' } },
    } as never)
    renderPage(needsApproval)
    const dialog = await openRefund('Request refund')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Submitted for approval')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View your requests' })).toHaveAttribute('href', '/gym/approvals?tab=mine')
    expect(screen.queryByText('Refund issued')).not.toBeInTheDocument()
  })

  it('server error: an over-refund shows the server’s own message in the dialog', async () => {
    refundPayment.mockRejectedValue(httpError(422, {
      message: 'Refund amount (Rs 4000) exceeds remaining refundable balance (Rs 3000)',
      code: 'refund_exceeds_refundable',
    }))
    renderPage(direct)
    const dialog = await openRefund('Refund')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refund' }))

    expect(await within(dialog).findByText(/exceeds remaining refundable balance/)).toBeInTheDocument()
  })

  it('a reason is required', async () => {
    renderPage(direct)
    await screen.findByText('Ali Raza')
    fireEvent.click(screen.getByTitle('Refund'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Refund' })).toBeDisabled()
  })

  it('permission missing: no refund control without payments.refund', async () => {
    renderPage(frontDeskContext)
    await screen.findByText('Ali Raza')
    expect(screen.queryByTitle('Refund')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Request refund')).not.toBeInTheDocument()
  })
})
