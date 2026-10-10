import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PayoutsPage from '@/app/(dashboard)/gym/payouts/page'
import { payoutsApi } from '@/lib/api/payouts'
import { gymApi } from '@/lib/api/gym'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, orgAdminContext, ownerContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
// The Google button loads Google's script; the dialog's own behaviour is what is tested here.
vi.mock('@/components/features/google-sign-in-button', () => ({
  GoogleSignInButton: ({ onCredential }: { onCredential: (t: string) => void }) => (
    <button type="button" onClick={() => onCredential('google-id-token')}>Google confirm</button>
  ),
}))

let accountRole = 'GYM_HOST'
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: accountRole },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: accountRole === 'GYM_HOST',
    isBranchManager: false,
  }),
}))

const httpError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

const balance = { branchId: null, totalCollected: 10000, totalRefunded: 500, totalExpenses: 1000.25, totalPayouts: 2000, availableBalance: 6499.75, currency: 'PKR' }
const bank = { bankName: 'Meezan Bank', accountTitle: 'Iron Gym Pvt Ltd', accountNumber: '1234010998877', iban: 'PK49MEZN001234010998877' }

// An owner holds everything; an org admin here holds payouts.view and the request key only.
const withPayoutKeys = (keys: string[]): MyContext => ({
  ...orgAdminContext,
  organizations: orgAdminContext.organizations.map((o) => ({ ...o, orgPermissions: [...o.orgPermissions, ...keys] })),
})

let requestPayout: ReturnType<typeof vi.spyOn>
let updateProfile: ReturnType<typeof vi.spyOn>

const renderPage = (context: MyContext = ownerContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PayoutsPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'GYM_HOST'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(payoutsApi, 'balance').mockResolvedValue(ok(balance) as never)
  vi.spyOn(payoutsApi, 'list').mockResolvedValue(ok({ payouts: [
    { id: 'po1', branchId: null, amount: 2000, currency: 'PKR', status: 'PENDING', notes: 'October', createdAt: '2026-10-05T10:00:00Z' },
  ] }) as never)
  vi.spyOn(gymApi, 'getGymProfile').mockResolvedValue(ok({ gym: { id: 'g1', paymentDetailsJson: bank } }) as never)
  requestPayout = vi.spyOn(payoutsApi, 'request').mockResolvedValue({ status: 201, data: { success: true, data: { id: 'po2' } } } as never)
  updateProfile = vi.spyOn(gymApi, 'updateGymProfile').mockResolvedValue(
    ok({ gym: { id: 'g1', paymentDetailsJson: bank, paymentDetailsUpdatedAt: '2026-10-10T08:00:00Z' } }) as never
  )
})
afterEach(() => vi.restoreAllMocks())

describe('Payouts', () => {
  it('allowed: shows the ledger-derived balance exactly as the server sent it', async () => {
    renderPage()
    const balanceBox = await screen.findByTestId('payout-balance')
    await waitFor(() => expect(within(balanceBox).getByText(/6,499\.75/)).toBeInTheDocument())
    expect(within(balanceBox).getByText(/1,000\.25/)).toBeInTheDocument()
    expect(await screen.findByText('October')).toBeInTheDocument()
  })

  it('shows the bank account masked, never the full number', async () => {
    renderPage()
    const details = await screen.findByTestId('bank-details')
    expect(details).toHaveTextContent('Meezan Bank')
    expect(details).toHaveTextContent('8877')
    expect(details).not.toHaveTextContent('1234010998877')
  })

  it('direct request: posts the amount with an Idempotency-Key and says it was requested', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Request payout' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '1,500.50' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request payout' }))

    await waitFor(() => expect(requestPayout).toHaveBeenCalledWith({ amount: 1500.5 }, expect.any(String)))
    expect(screen.queryByText('Submitted for approval')).not.toBeInTheDocument()
  })

  it('202 pending: the shared notice, never "requested"', async () => {
    requestPayout.mockResolvedValue({
      status: 202,
      data: { success: true, data: { approvalRequestId: 'req-3', status: 'PENDING', summary: 'Request payout: Rs 1500' } },
    } as never)
    renderPage(withPayoutKeys(['payouts.view', 'payouts.request']))
    fireEvent.click(await screen.findByRole('button', { name: 'Ask for a payout' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '1500' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Submitted for approval')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View your requests' })).toHaveAttribute('href', '/gym/approvals?tab=mine')
  })

  it('server error: the cooling-period message is shown as the server wrote it', async () => {
    requestPayout.mockRejectedValue(httpError(422, {
      code: 'cooling_period_active',
      message: 'Payout requests are temporarily blocked. Bank payout details were updated within the last 24 hours (20h remaining in cooling period).',
    }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Request payout' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '100' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request payout' }))

    expect(await within(dialog).findByText(/20h remaining in cooling period/)).toBeInTheDocument()
  })

  it('refuses a bad amount before any request', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Request payout' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '12.345' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request payout' }))

    expect(await within(dialog).findByText(/at most two decimals/)).toBeInTheDocument()
    expect(requestPayout).not.toHaveBeenCalled()
  })

  it('"All available" puts the server balance in the amount box', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Request payout' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'All available' })).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole('button', { name: 'All available' }))
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue('6499.75')
  })

  it('permission missing: opened by URL without payouts.view, a clear state and no requests', async () => {
    accountRole = 'MEMBER'
    renderPage(frontDeskContext)
    expect(await screen.findByTestId('no-access')).toBeInTheDocument()
    expect(payoutsApi.balance).not.toHaveBeenCalled()
  })

  it('permission missing: someone who may view but not manage bank details sees no bank card and no profile request', async () => {
    accountRole = 'MEMBER'
    const getProfile = vi.spyOn(gymApi, 'getGymProfile')
    renderPage(withPayoutKeys(['payouts.view']))
    await screen.findByTestId('payout-balance')
    expect(screen.queryByText('Bank details')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request payout|ask for a payout/i })).not.toBeInTheDocument()
    expect(getProfile).not.toHaveBeenCalled()
  })

  it('empty: no payouts yet', async () => {
    vi.spyOn(payoutsApi, 'list').mockResolvedValue(ok({ payouts: [] }) as never)
    renderPage()
    expect(await screen.findByText('No payouts yet')).toBeInTheDocument()
  })

  it('load error shows the server message', async () => {
    vi.spyOn(payoutsApi, 'balance').mockRejectedValue(httpError(500, { message: 'Ledger store is offline' }))
    renderPage()
    expect(await screen.findByText('Ledger store is offline')).toBeInTheDocument()
  })
})

describe('Bank details need re-authentication (SEC-13, NEW-35)', () => {
  const editAndContinue = async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Account number/), { target: { value: '9998887776665' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    return screen.findByRole('alertdialog')
  }

  it('nothing is sent until the person confirms; then the password goes with the new details', async () => {
    const reauth = await editAndContinue()
    expect(updateProfile).not.toHaveBeenCalled()

    fireEvent.change(within(reauth).getByLabelText('Account password'), { target: { value: 'correct horse' } })
    fireEvent.click(within(reauth).getByRole('button', { name: 'Save bank details' }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalled())
    expect(updateProfile.mock.calls[0][0]).toMatchObject({
      password: 'correct horse',
      paymentDetailsJson: expect.objectContaining({ accountNumber: '9998887776665', bankName: 'Meezan Bank' }),
    })
  })

  it('a Google-only account confirms with Google instead of a password', async () => {
    const reauth = await editAndContinue()
    fireEvent.click(within(reauth).getByRole('button', { name: 'Google confirm' }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalled())
    expect(updateProfile.mock.calls[0][0]).toMatchObject({ provider: 'GOOGLE', idToken: 'google-id-token' })
    expect(updateProfile.mock.calls[0][0]).not.toHaveProperty('password')
  })

  it('re-auth required: the server’s message stays in the dialog and nothing is reported saved', async () => {
    updateProfile.mockRejectedValue(httpError(401, { code: 'invalid_credentials', message: 'Incorrect password' }))
    const reauth = await editAndContinue()
    fireEvent.change(within(reauth).getByLabelText('Account password'), { target: { value: 'wrong' } })
    fireEvent.click(within(reauth).getByRole('button', { name: 'Save bank details' }))

    expect(await within(reauth).findByText('Incorrect password')).toBeInTheDocument()
    expect(screen.queryByText('Bank details updated')).not.toBeInTheDocument()
  })

  it('the Save button is disabled without a password', async () => {
    const reauth = await editAndContinue()
    expect(within(reauth).getByRole('button', { name: 'Save bank details' })).toBeDisabled()
  })

  it('needs bank name, title and an account number or IBAN before it asks for the password', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Bank name/), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))

    expect(await within(dialog).findByText(/Fill in: Bank name/)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
