import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PaymentsPage from '@/app/(dashboard)/gym/payments/page'
import { paymentsApi } from '@/lib/api/payments'
import { gymApi } from '@/lib/api/gym'
import { hostApi } from '@/lib/api/host'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, withPermissions } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
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

const MEMBER_ID = '11111111-1111-4111-8111-111111111111'
const httpError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

const row = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, userId: 'u1', paymentFor: 'MEMBERSHIP', amount: 3000.5, currency: 'PKR', method: 'CASH',
  status, branchId: 'branch-1', createdAt: '2026-10-01T10:00:00.000Z', user: { fullName: `Member ${id}` }, ...extra,
})

const staff = withPermissions(frontDeskContext, ['members.view', 'payments.verify'])

let getPayments: ReturnType<typeof vi.spyOn>
let recordPayment: ReturnType<typeof vi.spyOn>
let paymentAction: ReturnType<typeof vi.spyOn>

const renderPage = (context: MyContext = staff) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [{ id: 'branch-1', branchName: 'Uptown' }] }) as never)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PaymentsPage />
    </QueryClientProvider>
  )
}

const openRecord = async () => {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByPlaceholderText('member@example.com'), { target: { value: 'ali@example.test' } })
  return dialog
}
const submitRecord = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: /^record payment$/i }))

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  getPayments = vi.spyOn(paymentsApi, 'getPayments').mockResolvedValue(
    ok({ payments: [row('p1', 'PENDING'), row('p2', 'STAFF_COLLECTED')] }) as never
  )
  vi.spyOn(hostApi, 'lookupBranchMember').mockResolvedValue(
    ok({ exists: true, user: { id: MEMBER_ID, fullName: 'Ali Raza', email: 'ali@example.test' }, subscriptions: [] }) as never
  )
  recordPayment = vi.spyOn(paymentsApi, 'recordPayment').mockResolvedValue(ok({ payment: { id: 'pay-1' }, invoice: null }) as never)
  paymentAction = vi.spyOn(paymentsApi, 'paymentAction').mockResolvedValue(ok({ payment: { id: 'p1' } }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Payments — money rules (PAY-02, REL-01)', () => {
  it('shows server amounts with their paisa, not rounded away', async () => {
    renderPage()
    expect((await screen.findAllByText(/3,000\.50/)).length).toBeGreaterThan(0)
  })

  it('sends an Idempotency-Key with the record request and the same key on a retry of the same payment', async () => {
    recordPayment.mockRejectedValueOnce(httpError(503, { message: 'The database is busy' }))
    const dialog = await openRecord()
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '1,500.50' } })
    submitRecord(dialog)

    expect(await within(dialog).findByText('The database is busy')).toBeInTheDocument()
    submitRecord(dialog)
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(2))

    const [firstBody, firstKey] = recordPayment.mock.calls[0]
    const [, secondKey] = recordPayment.mock.calls[1]
    expect(firstBody).toMatchObject({ userId: MEMBER_ID, amount: 1500.5, branchId: 'branch-1' })
    expect(typeof firstKey).toBe('string')
    expect(secondKey).toBe(firstKey)
  })

  it('a changed amount is a different request: a new key', async () => {
    recordPayment.mockRejectedValueOnce(httpError(503, { message: 'The database is busy' }))
    const dialog = await openRecord()
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '1000' } })
    submitRecord(dialog)
    await within(dialog).findByText('The database is busy')

    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '1200' } })
    submitRecord(dialog)
    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(2))
    expect(recordPayment.mock.calls[1][1]).not.toBe(recordPayment.mock.calls[0][1])
  })

  it('refuses more than two decimals before any request', async () => {
    const dialog = await openRecord()
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '10.123' } })
    submitRecord(dialog)

    expect(await within(dialog).findByText(/at most two decimals/i)).toBeInTheDocument()
    expect(recordPayment).not.toHaveBeenCalled()
  })

  it('shows the server’s own sentence when recording is refused (422), not "Failed to record payment"', async () => {
    recordPayment.mockRejectedValue(httpError(422, { message: 'Validation failed', errors: [{ field: 'amount', message: 'amount must be greater than 0' }] }))
    const dialog = await openRecord()
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '5' } })
    submitRecord(dialog)

    expect(await within(dialog).findByText('amount must be greater than 0')).toBeInTheDocument()
    expect(screen.queryByText(/Failed to record payment/)).not.toBeInTheDocument()
  })

  it('sends the shift named in the record dialog', async () => {
    const dialog = await openRecord()
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '500' } })
    fireEvent.change(within(dialog).getByPlaceholderText(/Morning/), { target: { value: 'Evening' } })
    submitRecord(dialog)

    await waitFor(() => expect(recordPayment).toHaveBeenCalled())
    expect(recordPayment.mock.calls[0][0]).toMatchObject({ shift: 'Evening' })
  })
})

describe('Payments — actions and states', () => {
  it('collect asks for the shift and posts it', async () => {
    renderPage()
    await screen.findByText('Member p1')
    fireEvent.click(screen.getByTitle('Mark as Collected (Step 1)'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/shift/i), { target: { value: 'Morning' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as collected' }))

    await waitFor(() => expect(paymentAction).toHaveBeenCalledWith('p1', { action: 'collect', shift: 'Morning' }))
  })

  it('reject needs a reason and sends it, as the app does', async () => {
    renderPage()
    await screen.findByText('Member p1')
    fireEvent.click(screen.getAllByTitle('Reject')[0])
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Reject payment' })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Receipt does not match' } })
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(paymentAction).toHaveBeenCalledWith('p1', { action: 'reject', rejectedReason: 'Receipt does not match' })
    )
  })

  it('a refused action shows the server’s reason inside the dialog', async () => {
    paymentAction.mockRejectedValue(httpError(409, { message: 'Payment is already completed' }))
    renderPage()
    await screen.findByText('Member p1')
    fireEvent.click(screen.getByTitle('Mark as Collected (Step 1)'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as collected' }))

    expect(await within(dialog).findByText('Payment is already completed')).toBeInTheDocument()
  })

  it('the Collected tab never sends status=STAFF_COLLECTED (the server answers 422) and keeps only collected rows', async () => {
    renderPage()
    await screen.findByText('Member p1')
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Collected' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Collected' }))

    expect(await screen.findByText('Member p2')).toBeInTheDocument()
    expect(screen.queryByText('Member p1')).not.toBeInTheDocument()
    for (const [params] of getPayments.mock.calls) {
      expect(params).not.toMatchObject({ status: 'STAFF_COLLECTED' })
    }
  })

  it('permission missing: opened by URL without payments.view it says so and calls nothing', async () => {
    const noView: MyContext = {
      ...staff,
      organizations: staff.organizations.map((o) => ({
        ...o,
        branches: o.branches.map((b) => ({ ...b, permissions: ['dashboard.view'] })),
      })),
    }
    renderPage(noView)

    expect(await screen.findByTestId('no-access')).toBeInTheDocument()
    expect(getPayments).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
  })

  it('server error: the list failure shows the server message with a retry', async () => {
    getPayments.mockRejectedValue(httpError(500, { message: 'Payments database unavailable' }))
    renderPage()

    expect(await screen.findByText('Payments database unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('empty: an honest empty state', async () => {
    getPayments.mockResolvedValue(ok({ payments: [] }) as never)
    renderPage()
    expect(await screen.findByText('No payments found')).toBeInTheDocument()
  })
})
