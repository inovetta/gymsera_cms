import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from '@/app/(dashboard)/dashboard/page'
import { reportsApi } from '@/lib/api/reports'
import { gymApi } from '@/lib/api/gym'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { branchManagerContext, frontDeskContext, ownerContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('recharts', () => {
  const Box = ({ children }: any) => <div>{children}</div>
  return { LineChart: Box, Line: Box, XAxis: Box, YAxis: Box, CartesianGrid: Box, Tooltip: Box, ResponsiveContainer: Box }
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

let stats: ReturnType<typeof vi.spyOn>
let yearly: ReturnType<typeof vi.spyOn>
let branchDash: ReturnType<typeof vi.spyOn>
let members: ReturnType<typeof vi.spyOn>

const renderDashboard = (context: MyContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'MEMBER'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  stats = vi.spyOn(reportsApi, 'getDashboardStats').mockResolvedValue(
    ok({ members: { active: 40 }, revenue: { thisMonth: 90000 }, attendance: { checkInsToday: 12 } }) as never
  )
  yearly = vi.spyOn(reportsApi, 'getYearlyRevenue').mockResolvedValue(ok({ year: 2026, data: [{ month: 'Jan', revenue: 5 }] }) as never)
  branchDash = vi
    .spyOn(reportsApi, 'getBranchDashboard')
    .mockResolvedValue(ok({ todaysCheckins: 7, activeMembers: 25, monthlyRevenue: null, netProfit: null }) as never)
  members = vi.spyOn(gymApi, 'getMembers').mockResolvedValue(ok({ members: [] }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(
    ok({ branches: [{ id: 'branch-1', branchName: 'Uptown', address: 'x', status: 'ACTIVE' }] }) as never
  )
})
afterEach(() => vi.restoreAllMocks())

describe('Dashboard — revenue needs dashboard.revenue.view (NEW-45f)', () => {
  it('a Front Desk user (revenue off) never requests or shows the revenue chart or Monthly Revenue card', async () => {
    renderDashboard(frontDeskContext)

    // Counts arrive from the per-branch dashboard, which needs only dashboard.view.
    expect((await screen.findAllByText('25')).length).toBe(2) // Active Members and Active Subscriptions
    expect(branchDash).toHaveBeenCalledWith('branch-1')

    expect(screen.queryByText('Revenue Overview')).not.toBeInTheDocument()
    expect(screen.queryByText('Monthly Revenue')).not.toBeInTheDocument()
    expect(stats).not.toHaveBeenCalled()
    expect(yearly).not.toHaveBeenCalled()
  })

  it('the counts for a Front Desk user are the real numbers, not zeros from a refused request', async () => {
    renderDashboard(frontDeskContext)
    await waitFor(() => expect(screen.getAllByText('25').length).toBeGreaterThan(0))
    expect(screen.getByText("Today's Attendance").closest('div')?.parentElement).toHaveTextContent('7')
  })

  it('a Branch Manager (revenue on) gets the chart, the card and the report totals', async () => {
    renderDashboard(branchManagerContext)

    expect(await screen.findByText('Revenue Overview')).toBeInTheDocument()
    expect(screen.getByText('Monthly Revenue')).toBeInTheDocument()
    await waitFor(() => expect(stats).toHaveBeenCalled())
    expect(yearly).toHaveBeenCalled()
    expect(branchDash).not.toHaveBeenCalled()
  })

  it('the owner is unchanged: chart, card and report totals', async () => {
    accountRole = 'GYM_HOST'
    renderDashboard(ownerContext)

    expect(await screen.findByText('Revenue Overview')).toBeInTheDocument()
    expect(screen.getByText('Monthly Revenue')).toBeInTheDocument()
    await waitFor(() => expect(stats).toHaveBeenCalled())
    expect(yearly).toHaveBeenCalled()
  })

  it('recent members are only requested by someone who holds members.view', async () => {
    renderDashboard(frontDeskContext)
    await waitFor(() => expect(members).toHaveBeenCalled())

    const noMembers: MyContext = {
      ...frontDeskContext,
      organizations: frontDeskContext.organizations.map((o) => ({
        ...o,
        branches: o.branches.map((b) => ({ ...b, permissions: b.permissions.filter((k) => k !== 'members.view') })),
      })),
    }
    cleanup()
    vi.restoreAllMocks()
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
    vi.spyOn(reportsApi, 'getBranchDashboard').mockResolvedValue(ok({ todaysCheckins: 1, activeMembers: 1 }) as never)
    vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
    const noCall = vi.spyOn(gymApi, 'getMembers').mockResolvedValue(ok({ members: [] }) as never)
    renderDashboard(noMembers)
    await screen.findAllByText('Active Members')
    // The other queries fire together once access is known; by then members would have.
    await waitFor(() => expect(reportsApi.getBranchDashboard).toHaveBeenCalled())
    expect(noCall).not.toHaveBeenCalled()
    expect(screen.queryByText('Recent Members')).not.toBeInTheDocument()
  })
})
