import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PaymentsPage from '@/app/(dashboard)/gym/payments/page'
import { paymentsApi } from '@/lib/api/payments'
import { gymApi } from '@/lib/api/gym'
import { hostApi } from '@/lib/api/host'
import { meApi } from '@/lib/api/me'
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

let lookup: ReturnType<typeof vi.spyOn>
let recordPayment: ReturnType<typeof vi.spyOn>

const context = withPermissions(frontDeskContext, ['members.view'])

/** Open the dialog, type the email and the amount, press Record Payment inside the dialog. */
const fillAndSubmit = async (email = 'Ali@Example.test') => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [{ id: 'branch-1', branchName: 'Uptown' }] }) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PaymentsPage />
    </QueryClientProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByPlaceholderText('member@example.com'), { target: { value: email } })
  fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '3000' } })
  fireEvent.click(within(dialog).getByRole('button', { name: /^record payment$/i }))
  return dialog
}

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(paymentsApi, 'getPayments').mockResolvedValue(ok({ payments: [] }) as never)
  lookup = vi.spyOn(hostApi, 'lookupBranchMember').mockResolvedValue(
    ok({ exists: true, user: { id: MEMBER_ID, fullName: 'Ali Raza', email: 'ali@example.test' }, subscriptions: [] }) as never
  )
  recordPayment = vi.spyOn(paymentsApi, 'recordPayment').mockResolvedValue(ok({ payment: { id: 'pay-1' }, invoice: null }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Record Payment finds the member by email (NEW-57)', () => {
  it('no longer asks for a user id', async () => {
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
    vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [{ id: 'branch-1', branchName: 'Uptown' }] }) as never)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PaymentsPage />
      </QueryClientProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).queryByText(/user id/i)).not.toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText('member@example.com')).toBeInTheDocument()
  })

  it('looks the member up at the branch and records the payment with the member’s userId', async () => {
    await fillAndSubmit()

    await waitFor(() => expect(recordPayment).toHaveBeenCalledTimes(1))
    expect(lookup).toHaveBeenCalledWith('branch-1', 'ali@example.test')
    // The second argument is the Idempotency-Key the money endpoint requires.
    expect(recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ userId: MEMBER_ID, branchId: 'branch-1', amount: 3000, method: 'CASH', paymentFor: 'MEMBERSHIP' }),
      expect.any(String)
    )
    expect(recordPayment.mock.calls[0][0]).not.toHaveProperty('email')
  })

  it('shows "no member" next to the email and records nothing when the lookup finds nobody', async () => {
    lookup.mockResolvedValue(ok({ exists: false, subscriptions: [] }) as never)
    const dialog = await fillAndSubmit('nobody@example.test')

    expect(await within(dialog).findByText('No member with the email nobody@example.test was found at this branch.')).toBeInTheDocument()
    expect(recordPayment).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('says the user may not look members up here on a 403, and records nothing', async () => {
    lookup.mockRejectedValue(httpError(403, {}))
    const dialog = await fillAndSubmit()

    expect(await within(dialog).findByText('You do not have permission to look up members at this branch.')).toBeInTheDocument()
    expect(recordPayment).not.toHaveBeenCalled()
  })

  it('rejects an invalid email before any request is made', async () => {
    const dialog = await fillAndSubmit('not-an-email')

    expect(await within(dialog).findByText('Enter a valid email address')).toBeInTheDocument()
    expect(lookup).not.toHaveBeenCalled()
    expect(recordPayment).not.toHaveBeenCalled()
  })
})
