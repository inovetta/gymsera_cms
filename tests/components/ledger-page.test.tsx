import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LedgerPage from '@/app/(dashboard)/gym/ledger/page'
import { ledgerApi } from '@/lib/api/ledger'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, ownerContext, withPermissions } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
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

const httpError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

const day = (status: 'OPEN' | 'CLOSED' = 'OPEN') => ({
  ledgerDay: { id: 'day-1', branchId: 'branch-1', businessDate: '2026-10-10', status },
  businessDate: '2026-10-10',
  isMissed: false,
  payments: [{ id: 'p1', userId: 'u1', amount: 1500.5, method: 'CASH', status: 'COMPLETED' }],
  totals: { expected: 5000, collected: 4500.5, verified: 4000, pending: 500.5, variance: -499.5 },
  byMethod: { CASH: 3000, BANK_TRANSFER: 1500.5 },
  byCollector: [{
    collectorId: 'c1', collectorName: 'Sana Ahmed', total: 3000, cashCollected: 2500, cashExpected: 3000, count: 4,
    shifts: { MORNING: { shift: 'MORNING', total: 3000, cashCollected: 2500, cashExpected: 3000, count: 4 } },
  }],
  adjustments: [{ id: 'a1', type: 'DISCREPANCY_NOTE', amount: null, reason: 'Short by 500 at the desk', createdAt: '2026-10-10T08:00:00Z' }],
})

const manager = withPermissions(frontDeskContext, ['ledger.today.view', 'ledger.verify', 'ledger.verify.direct', 'ledger.close', 'ledger.close.direct'])
const requester = withPermissions(frontDeskContext, ['ledger.today.view', 'ledger.verify', 'ledger.close'])

let today: ReturnType<typeof vi.spyOn>
let openDays: ReturnType<typeof vi.spyOn>
let closeDay: ReturnType<typeof vi.spyOn>
let addAdjustment: ReturnType<typeof vi.spyOn>

const renderPage = (context: MyContext = manager) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LedgerPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'MEMBER'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  today = vi.spyOn(ledgerApi, 'today').mockResolvedValue(ok(day()) as never)
  openDays = vi.spyOn(ledgerApi, 'openDays').mockResolvedValue(ok({ days: [] }) as never)
  vi.spyOn(ledgerApi, 'weekly').mockResolvedValue(ok({ fromDate: '2026-10-05', toDate: '2026-10-11', totals: day().totals, byMethod: {}, byCollector: [], perDay: [] }) as never)
  closeDay = vi.spyOn(ledgerApi, 'closeDay').mockResolvedValue({ status: 200, data: { success: true, data: { status: 'EXECUTED' } } } as never)
  addAdjustment = vi.spyOn(ledgerApi, 'addAdjustment').mockResolvedValue({ status: 201, data: { success: true, data: {} } } as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Ledger page', () => {
  it('allowed: shows server totals, cash per collector against expected, and the day’s notes', async () => {
    renderPage()

    expect(await screen.findByTestId('ledger-totals')).toBeInTheDocument()
    expect(within(screen.getByTestId('ledger-totals')).getByText(/5,000/)).toBeInTheDocument()
    expect(screen.getByText('Sana Ahmed')).toBeInTheDocument()
    expect(screen.getByText('Cash collected')).toBeInTheDocument()
    expect(screen.getByText('Cash expected')).toBeInTheDocument()
    expect(screen.getByText('Collected and expected cash do not match.')).toBeInTheDocument()
    expect(screen.getByText('Short by 500 at the desk')).toBeInTheDocument()
    // The branch is always named for a team member (no tenant-wide fallback).
    expect(today).toHaveBeenCalledWith('branch-1')
  })

  it('direct close: confirms, posts the day and says it is closed', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Close day' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close day' }))

    await waitFor(() => expect(closeDay).toHaveBeenCalledWith('branch-1', { ledgerDayId: 'day-1', businessDate: '2026-10-10' }, expect.any(String)))
    expect(screen.queryByText('Submitted for approval')).not.toBeInTheDocument()
  })

  it('202: a close that needs approval shows the shared notice, never "done"', async () => {
    closeDay.mockResolvedValue({
      status: 202,
      data: { success: true, data: { status: 'PENDING', requestId: 'req-1', summary: 'Close ledger — 2026-10-10' } },
    } as never)
    renderPage(requester)

    fireEvent.click(await screen.findByRole('button', { name: 'Request close' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }))

    expect(await screen.findByText('Submitted for approval')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View your requests' })).toHaveAttribute('href', '/gym/approvals?tab=mine')
    expect(screen.queryByText('Day closed')).not.toBeInTheDocument()
  })

  it('202: an adjustment that needs approval shows the notice', async () => {
    addAdjustment.mockResolvedValue({
      status: 202,
      data: { success: true, data: { approvalRequestId: 'req-2', status: 'PENDING', summary: 'Ledger adjustment — DISCREPANCY_NOTE: short' } },
    } as never)
    renderPage(requester)

    fireEvent.click(await screen.findByRole('button', { name: /add note/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'short' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save note' }))

    expect(await screen.findByText('Submitted for approval')).toBeInTheDocument()
    expect(addAdjustment).toHaveBeenCalledWith('day-1', expect.objectContaining({ branchId: 'branch-1', reason: 'short' }), expect.any(String))
  })

  it('a note needs a reason and a valid signed amount', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /add note/i }))
    const dialog = await screen.findByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Save note' })
    expect(save).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Counted again' } })
    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '12.345' } })
    fireEvent.click(save)
    expect(await within(dialog).findByText(/at most two decimals/i)).toBeInTheDocument()
    expect(addAdjustment).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '-250.50' } })
    fireEvent.click(save)
    await waitFor(() => expect(addAdjustment).toHaveBeenCalled())
    expect(addAdjustment.mock.calls[0][1]).toMatchObject({ amount: -250.5, type: 'DISCREPANCY_NOTE' })
  })

  it('a refused close shows the server’s message in the dialog', async () => {
    closeDay.mockRejectedValue(httpError(409, { message: 'This day is already closed' }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Close day' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close day' }))

    expect(await within(dialog).findByText('This day is already closed')).toBeInTheDocument()
  })

  it('permission missing: no close or note controls without ledger.close / ledger.verify', async () => {
    renderPage(withPermissions(frontDeskContext, ['ledger.today.view']))
    await screen.findByTestId('ledger-totals')

    expect(screen.queryByRole('button', { name: /close day|request close/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add note/i })).not.toBeInTheDocument()
    // Weekly and monthly need their own keys.
    expect(screen.queryByRole('tab', { name: 'This week' })).not.toBeInTheDocument()
  })

  it('permission missing: opened by URL without ledger.today.view, a clear state and no requests', async () => {
    renderPage(frontDeskContext)

    expect(await screen.findByTestId('no-access')).toBeInTheDocument()
    expect(today).not.toHaveBeenCalled()
  })

  it('server error shows the server message with a retry', async () => {
    today.mockRejectedValue(httpError(500, { message: 'The ledger store is offline' }))
    renderPage()

    expect(await screen.findByText('The ledger store is offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('empty: a day with no collections says so', async () => {
    today.mockResolvedValue(ok({ ...day(), payments: [], byMethod: {}, byCollector: [], adjustments: [], totals: { expected: 0, collected: 0, verified: 0, pending: 0, variance: 0 } }) as never)
    renderPage()
    expect(await screen.findByText('No collections on this day')).toBeInTheDocument()
  })

  it('open days: lists the reconciliation queue and opens a day by date', async () => {
    openDays.mockResolvedValue(ok({ days: [{ id: 'd0', branchId: 'branch-1', businessDate: '2026-10-08', status: 'OPEN' }] }) as never)
    const dayQuery = vi.spyOn(ledgerApi, 'day').mockResolvedValue(ok({ ...day(), businessDate: '2026-10-08', isMissed: true }) as never)
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Open days/ }))
    fireEvent.click(screen.getByRole('tab', { name: /Open days/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reconcile' }))

    await waitFor(() => expect(dayQuery).toHaveBeenCalledWith('2026-10-08', 'branch-1'))
    expect(await screen.findByText('Missed')).toBeInTheDocument()
  })

  it('the owner starts on every branch (no branchId) and may pick one', async () => {
    accountRole = 'GYM_HOST'
    today.mockResolvedValue(ok({
      fromDate: '2026-10-10', toDate: '2026-10-10',
      branches: [{ branchId: 'branch-1', branchName: 'Uptown', businessDate: '2026-10-10', isMissed: false, totals: day().totals }],
      totals: day().totals, byMethod: {}, byCollector: [], payments: [],
    }) as never)
    renderPage(ownerContext)

    expect(await screen.findByText('Uptown')).toBeInTheDocument()
    expect(today).toHaveBeenCalledWith(undefined)
    // No close / note controls on the merged view.
    expect(screen.queryByRole('button', { name: /close day/i })).not.toBeInTheDocument()
  })
})
