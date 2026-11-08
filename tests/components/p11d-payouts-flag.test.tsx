/**
 * P11d, decision R-99 (owner, 2026-11-08): payouts are hidden at launch.
 *
 * The API says whether payouts exist in GET /meta/app-config (`features.payouts`, env
 * PAYOUTS_ENABLED, off by default). With it off the CMS shows no Payouts menu item and no payout
 * page (balance, payout requests, "Request payout"). Unknown (loading, an error, an older API
 * without the field) counts as off.
 *
 * The bank details stay (owner answer, 2026-11-08): travellers who pay by bank transfer are shown
 * them, so the owner keeps a "Bank details" entry, worded for traveller payments, with no payout
 * wording, on the same PUT /host/payout-account with re-authentication.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/sidebar'
import PayoutsPage from '@/app/(dashboard)/gym/payouts/page'
import BankDetailsPage from '@/app/(dashboard)/gym/bank-details/page'
import { appConfigApi } from '@/lib/api/app-config'
import { payoutsApi } from '@/lib/api/payouts'
import { meApi, MyContext } from '@/lib/api/me'
import { approvalsApi } from '@/lib/api/approvals'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, ownerContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: ({ title }: { title: string }) => <div data-testid="header">{title}</div> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: 'GYM_HOST' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: true,
    isBranchManager: false,
  }),
}))

const bank = { bankName: 'Meezan Bank', accountTitle: 'Iron Gym Pvt Ltd', accountNumber: '1234010998877', iban: 'PK49MEZN001234010998877' }
const account = { id: 'pa1', scope: 'TENANT', organizationId: null, provider: 'BANK_TRANSFER', status: 'ACTIVE', details: bank, detailsUpdatedAt: null }

const config = (features?: Record<string, unknown>) =>
  ok({ minAppVersion: { ios: null, android: null }, storeUrls: { ios: null, android: null }, ...(features ? { features } : {}) })

let balance: ReturnType<typeof vi.spyOn>
let list: ReturnType<typeof vi.spyOn>

const wrap = (ui: React.ReactElement, context: MyContext = ownerContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
  )
}

const menu = async () => {
  await screen.findByRole('link', { name: 'Dashboard' })
  await screen.findByRole('link', { name: 'Gym Profile' })
  await new Promise((r) => setTimeout(r, 50))
  const nav = screen.getAllByRole('navigation')[0]
  return within(nav).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, '').trim())
}

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
  balance = vi.spyOn(payoutsApi, 'balance').mockResolvedValue(ok({ branchId: null, totalCollected: 1, totalRefunded: 0, totalExpenses: 0, totalPayouts: 0, availableBalance: 1, currency: 'PKR' }) as never)
  list = vi.spyOn(payoutsApi, 'list').mockResolvedValue(ok({ payouts: [] }) as never)
  vi.spyOn(payoutsApi, 'getAccount').mockResolvedValue(ok({ account }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe.each([
  ['payouts: false', () => vi.spyOn(appConfigApi, 'get').mockResolvedValue(config({ payouts: false }) as never)],
  ['the config failed to load', () => vi.spyOn(appConfigApi, 'get').mockRejectedValue(new Error('Network Error'))],
  ['an older API without features', () => vi.spyOn(appConfigApi, 'get').mockResolvedValue(config() as never)],
])('R-99 off (%s)', (_label, arrange) => {
  beforeEach(() => { arrange() })

  it('the owner\'s menu has no Payouts item, and has Bank details', async () => {
    wrap(<Sidebar />)
    const titles = await menu()
    expect(titles).not.toContain('Payouts')
    expect(titles).toContain('Bank details')
    expect(screen.getByRole('link', { name: 'Bank details' })).toHaveAttribute('href', '/gym/bank-details')
  })

  it('/gym/payouts shows no balance, no payout requests and never calls the payout routes', async () => {
    wrap(<PayoutsPage />)
    expect(await screen.findByTestId('payouts-unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bank details/ })).toHaveAttribute('href', '/gym/bank-details')
    expect(screen.queryByTestId('payout-balance')).toBeNull()
    expect(screen.queryByText(/Request payout|Ask for a payout|Payout requests/)).toBeNull()
    await new Promise((r) => setTimeout(r, 50))
    expect(balance).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })

  it('/gym/bank-details shows the bank details for traveller payments, with no payout wording', async () => {
    wrap(<BankDetailsPage />)
    const details = await screen.findByTestId('bank-details')
    expect(details).toHaveTextContent('Meezan Bank')
    expect(details).not.toHaveTextContent('1234010998877')
    expect(screen.getByText(/travellers/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/payout/i)
    expect(balance).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })
})

describe('R-99 off: who sees Bank details', () => {
  it('a front desk without payouts.bank.manage sees neither Payouts nor Bank details', async () => {
    vi.spyOn(appConfigApi, 'get').mockResolvedValue(config({ payouts: false }) as never)
    vi.spyOn(tenantsApi, 'getMyTenant').mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403 } }))
    wrap(<Sidebar />, frontDeskContext)
    await screen.findByRole('link', { name: 'Dashboard' })
    await new Promise((r) => setTimeout(r, 80))
    expect(screen.queryByRole('link', { name: 'Payouts' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Bank details' })).toBeNull()
  })
})

describe('R-99 on: as before', () => {
  beforeEach(() => { vi.spyOn(appConfigApi, 'get').mockResolvedValue(config({ payouts: true }) as never) })

  it('the menu has Payouts and no separate Bank details item', async () => {
    wrap(<Sidebar />)
    const titles = await menu()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Payouts' })).toBeInTheDocument())
    expect(titles).not.toContain('Bank details')
  })

  it('/gym/payouts shows the balance and loads the payout list', async () => {
    wrap(<PayoutsPage />)
    expect(await screen.findByTestId('payout-balance')).toBeInTheDocument()
    await waitFor(() => expect(list).toHaveBeenCalled())
    expect(screen.queryByTestId('payouts-unavailable')).toBeNull()
  })
})
