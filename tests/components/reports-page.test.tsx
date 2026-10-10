import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReportsPage from '@/app/(dashboard)/gym/reports/page'
import { reportsApi } from '@/lib/api/reports'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { branchManagerContext, frontDeskContext, orgAdminContext, ownerContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('recharts', () => {
  const Box = ({ children }: any) => <div>{children}</div>
  return { LineChart: Box, Line: Box, BarChart: Box, Bar: Box, PieChart: Box, Pie: Box, Cell: Box, Legend: Box, XAxis: Box, YAxis: Box, CartesianGrid: Box, Tooltip: Box, ResponsiveContainer: Box }
})

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

const branchReport = {
  branch: { id: 'branch-1', name: 'Uptown', status: 'ACTIVE' },
  members: { active: 41, frozen: 2, pending: 1, expiredThisMonth: 3 },
  revenue: { allTime: 250000.5, thisMonth: 48000, pendingCount: 2, staffCollectedCount: 1 },
  attendance: { checkInsToday: 9, checkInsThisMonth: 210 },
  staff: { active: 4 },
  planDistribution: [{ planId: 'pl1', planName: 'Monthly', count: 30 }],
  revenueByDay: [{ day: '2026-10-02', totalRevenue: '12000.00', count: '4' }],
}

let yearly: ReturnType<typeof vi.spyOn>
let branch: ReturnType<typeof vi.spyOn>
let monthly: ReturnType<typeof vi.spyOn>

const renderPage = (context: MyContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReportsPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'MEMBER'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  yearly = vi.spyOn(reportsApi, 'getYearlyRevenue').mockResolvedValue(
    ok({ year: 2026, data: [{ month: 'Jan', revenue: 1000 }, { month: 'Feb', revenue: 2500.5 }] }) as never
  )
  branch = vi.spyOn(reportsApi, 'getBranchReport').mockResolvedValue(ok(branchReport) as never)
  monthly = vi.spyOn(reportsApi, 'getMonthlyReport').mockResolvedValue(
    ok({
      period: { year: 2026, month: 10 },
      revenueByDay: [{ day: '2026-10-02', totalRevenue: '12000.00', count: '4' }],
      subscriptionsByDay: [{ day: '2026-10-02', count: '3' }],
      checkInsByDay: [{ day: '2026-10-02', count: '55' }],
    }) as never
  )
})
afterEach(() => vi.restoreAllMocks())

describe('Reports (UX-18)', () => {
  it('allowed (organization-wide revenue): yearly, branch totals from the server, and the monthly breakdown with its real shape', async () => {
    renderPage(orgAdminContext)

    expect(await screen.findByText('Revenue in 2026')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/48,000/)).toBeInTheDocument()) // thisMonth, the server's own number
    expect(screen.getByText(/250,000\.50/)).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
    await waitFor(() => expect(monthly).toHaveBeenCalled())
    expect(await screen.findByText('Check-ins by day')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeInTheDocument()
  })

  it('branch scope: a branch manager asks for their branch’s report and never for the unscoped organization-wide monthly', async () => {
    renderPage(branchManagerContext)

    await screen.findByText('Revenue in 2026')
    await waitFor(() => expect(branch).toHaveBeenCalledWith('branch-1'))
    expect(monthly).not.toHaveBeenCalled()
    expect(screen.getByTestId('monthly-org-only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /export pdf/i })).not.toBeInTheDocument()
  })

  it('permission missing: no revenue permission, a clear state and no request at all', async () => {
    renderPage(frontDeskContext)

    expect(await screen.findByTestId('no-access')).toBeInTheDocument()
    expect(yearly).not.toHaveBeenCalled()
    expect(branch).not.toHaveBeenCalled()
    expect(monthly).not.toHaveBeenCalled()
  })

  it('server error: the failing section shows the server message and retries, the others stay', async () => {
    branch.mockRejectedValue(httpError(500, { message: 'Branch report is unavailable' }))
    renderPage(branchManagerContext)

    expect(await screen.findByText('Branch report is unavailable')).toBeInTheDocument()
    expect(screen.getByText('Revenue in 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(branch.mock.calls.length).toBeGreaterThan(1))
  })

  it('empty: a month with nothing in it says so instead of drawing empty charts', async () => {
    monthly.mockResolvedValue(ok({ period: { year: 2026, month: 10 }, revenueByDay: [], subscriptionsByDay: [], checkInsByDay: [] }) as never)
    renderPage(orgAdminContext)

    expect(await screen.findByText(/Nothing recorded in/)).toBeInTheDocument()
  })

  it('the owner sees everything, with no branch picker when there is one branch', async () => {
    accountRole = 'GYM_HOST'
    renderPage(ownerContext)

    await screen.findByText('Revenue in 2026')
    await waitFor(() => expect(monthly).toHaveBeenCalled())
    expect(screen.queryByLabelText('Branch')).not.toBeInTheDocument()
  })
})
