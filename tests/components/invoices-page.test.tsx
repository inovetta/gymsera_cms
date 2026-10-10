import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InvoicesPage from '@/app/(dashboard)/gym/invoices/page'
import { invoicesApi } from '@/lib/api/invoices'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, ownerContext, withPermissions } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))

let accountRole = 'MEMBER'
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: accountRole },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: accountRole === 'GYM_HOST',
    isBranchManager: false,
  }),
}))

const invoice = {
  id: 'i1', userId: 'u1', invoiceNo: 'INV-UPTOWN-000042', invoiceType: 'MEMBERSHIP', subtotal: 3000, totalAmount: 3000.5,
  status: 'PAID', createdAt: '2026-10-01T10:00:00.000Z', user: { fullName: 'Ali Raza', email: 'ali@example.test' },
}

let getInvoices: ReturnType<typeof vi.spyOn>

const renderPage = (context: MyContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <InvoicesPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'MEMBER'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  getInvoices = vi.spyOn(invoicesApi, 'getInvoices').mockResolvedValue(ok({ invoices: [invoice] }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Invoices (PAY-05)', () => {
  it('shows the gapless number and the server total with paisa', async () => {
    renderPage(frontDeskContext)
    expect(await screen.findByText('INV-UPTOWN-000042')).toBeInTheDocument()
    expect(screen.getByText(/3,000\.50/)).toBeInTheDocument()
  })

  it('a team member’s request always names their branch (without it the server lists only their own invoices)', async () => {
    renderPage(frontDeskContext)
    await screen.findByText('INV-UPTOWN-000042')
    expect(getInvoices).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-1' }))
  })

  it('the owner starts on all branches and may pick one', async () => {
    accountRole = 'GYM_HOST'
    const two = withPermissions(ownerContext, [])
    two.organizations[0].branches.push({ id: 'branch-2', name: 'Downtown', permissions: ['*'] })
    renderPage(two)
    await screen.findByText('INV-UPTOWN-000042')
    expect(getInvoices).toHaveBeenCalledWith(expect.not.objectContaining({ branchId: expect.anything() }))

    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'branch-2' } })
    await waitFor(() => expect(getInvoices).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-2' })))
  })

  it('permission missing: a clear state and no request', async () => {
    renderPage({
      ...frontDeskContext,
      organizations: frontDeskContext.organizations.map((o) => ({
        ...o,
        branches: o.branches.map((b) => ({ ...b, permissions: ['dashboard.view'] })),
      })),
    })
    expect(await screen.findByTestId('no-access')).toBeInTheDocument()
    expect(getInvoices).not.toHaveBeenCalled()
  })

  it('server error shows the server message and retries', async () => {
    getInvoices.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 500, data: { message: 'Invoice store is offline' } } }))
    renderPage(frontDeskContext)
    expect(await screen.findByText('Invoice store is offline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(getInvoices.mock.calls.length).toBeGreaterThan(1))
  })

  it('empty', async () => {
    getInvoices.mockResolvedValue(ok({ invoices: [] }) as never)
    renderPage(frontDeskContext)
    expect(await screen.findByText('No invoices found')).toBeInTheDocument()
  })
})
