import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardPage from '@/app/(dashboard)/dashboard/page'
import { reportsApi } from '@/lib/api/reports'
import { gymApi } from '@/lib/api/gym'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { branchManagerContext, frontDeskContext, withPermissions } from '../fixtures/context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('recharts', () => {
  const Box = ({ children }: any) => <div>{children}</div>
  return { LineChart: Box, Line: Box, XAxis: Box, YAxis: Box, CartesianGrid: Box, Tooltip: Box, ResponsiveContainer: Box }
})
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: 'MEMBER' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: false,
    isBranchManager: false,
  }),
}))

const renderDashboard = (context: MyContext | Promise<never>) => {
  vi.spyOn(meApi, 'getContext').mockImplementation((() =>
    context instanceof Promise ? context : Promise.resolve(ok(context))) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>
  )
}

const withoutKeys = (source: MyContext, keys: string[]): MyContext => ({
  ...source,
  organizations: source.organizations.map((o) => ({
    ...o,
    branches: o.branches.map((b) => ({ ...b, permissions: b.permissions.filter((k) => !keys.includes(k)) })),
  })),
})

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(gymApi, 'getMembers').mockResolvedValue(ok({ members: [] }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
  vi.spyOn(reportsApi, 'getYearlyRevenue').mockResolvedValue(ok({ year: 2026, data: [] }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Dashboard states (UX-18)', () => {
  it('allowed: revenue holders see the revenue card with the server amount', async () => {
    vi.spyOn(reportsApi, 'getDashboardStats').mockResolvedValue(
      ok({ members: { active: 40 }, revenue: { thisMonth: 90000.5 }, attendance: { checkInsToday: 12 } }) as never
    )
    renderDashboard(branchManagerContext)

    expect(await screen.findByText('Monthly Revenue')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/90,000\.50/)).toBeInTheDocument())
  })

  it('permission missing: no revenue card and no zero revenue anywhere', async () => {
    vi.spyOn(reportsApi, 'getBranchDashboard').mockResolvedValue(
      ok({ todaysCheckins: 3, activeMembers: 9, monthlyRevenue: null }) as never
    )
    const stats = vi.spyOn(reportsApi, 'getDashboardStats')
    renderDashboard(frontDeskContext)

    expect((await screen.findAllByText('9')).length).toBe(2)
    expect(screen.queryByText('Monthly Revenue')).not.toBeInTheDocument()
    expect(screen.queryByText(/Rs\s?0\b|PKR\s?0\b/)).not.toBeInTheDocument()
    expect(stats).not.toHaveBeenCalled()
  })

  it('no dashboard permission at all: a clear state, no cards of zeros, no figure requests', async () => {
    const stats = vi.spyOn(reportsApi, 'getDashboardStats')
    const branchDash = vi.spyOn(reportsApi, 'getBranchDashboard')
    renderDashboard(withoutKeys(frontDeskContext, ['dashboard.view']))

    expect(await screen.findByTestId('dashboard-no-figures')).toBeInTheDocument()
    expect(screen.queryByText('Active Members')).not.toBeInTheDocument()
    expect(stats).not.toHaveBeenCalled()
    expect(branchDash).not.toHaveBeenCalled()
  })

  it('server error with message: shows the server text and retries', async () => {
    const stats = vi.spyOn(reportsApi, 'getDashboardStats').mockRejectedValue({
      response: { status: 500, data: { message: 'Reporting database is busy' } },
    })
    renderDashboard(branchManagerContext)

    expect(await screen.findByText('Reporting database is busy')).toBeInTheDocument()
    // The cards do not show a number nobody measured.
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(stats.mock.calls.length).toBeGreaterThan(1))
  })

  it('loading: skeleton cards while the context is on its way, not a flash of zeros', async () => {
    renderDashboard(new Promise(() => {}) as Promise<never>)
    // The page has not got its context yet.
    await waitFor(() => expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument())
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('empty: no branches yet says so', async () => {
    vi.spyOn(reportsApi, 'getDashboardStats').mockResolvedValue(
      ok({ members: { active: 0 }, revenue: { thisMonth: 0 }, attendance: { checkInsToday: 0 } }) as never
    )
    renderDashboard(withPermissions(branchManagerContext, []))
    expect(await screen.findByText('No branches found')).toBeInTheDocument()
  })
})
