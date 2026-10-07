import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchDetailPage from '@/app/(dashboard)/gym/branches/[id]/page'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { paymentsApi } from '@/lib/api/payments'
import { gymApi } from '@/lib/api/gym'
import { meApi, MyContext } from '@/lib/api/me'
import { reportsApi } from '@/lib/api/reports'
import { subscriptionsApi } from '@/lib/api/subscriptions'
import { attendanceApi } from '@/lib/api/attendance'
import { tenantsApi } from '@/lib/api/tenants'
import { approvalsApi } from '@/lib/api/approvals'
import { notificationsApi } from '@/lib/api/notifications'
import { ok } from '../fixtures/team'
import { frontDeskContext, ownerContext, withPermissions } from '../fixtures/context'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: 'branch-1' }),
  usePathname: () => '/gym/branches/branch-1',
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }))
vi.mock('@/components/layout/header', async (orig) => {
  // The branch page renders a Header; the Header test below imports the real one.
  const real = (await orig()) as any
  return { Header: ({ title }: any) => <div data-testid="page-header">{title}</div>, RealHeader: real.Header }
})
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))

let accountRole = 'MEMBER'
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Sana Malik', role: accountRole },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: accountRole === 'GYM_HOST',
    isBranchManager: false,
  }),
}))

const wrap = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  accountRole = 'MEMBER'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Branch detail — payment buttons follow permissions at the branch (NEW-45g)', () => {
  const open = async (context: MyContext) => {
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
    vi.spyOn(gymApi, 'getBranch').mockResolvedValue(ok({ branch: { id: 'branch-1', branchName: 'Uptown', address: 'x', status: 'ACTIVE' } }) as never)
    vi.spyOn(gymApi, 'getBranchStaff').mockResolvedValue(ok({ staff: [] }) as never)
    vi.spyOn(subscriptionsApi, 'getStaffSubscriptions').mockResolvedValue(ok({ subscriptions: [] }) as never)
    vi.spyOn(attendanceApi, 'getAttendance').mockResolvedValue(ok({ logs: [] }) as never)
    vi.spyOn(reportsApi, 'getBranchReport').mockResolvedValue(
      ok({
        attendance: { checkInsThisMonth: 0, checkInsToday: 0 },
        members: { active: 0, expiredThisMonth: 0, frozen: 0, pending: 0 },
        planDistribution: [],
        revenue: { allTime: 0, pendingCount: 0, staffCollectedCount: 0, thisMonth: 0 },
        revenueByDay: [],
        staff: { active: 0 },
      }) as never
    )
    vi.spyOn(paymentsApi, 'getPayments').mockResolvedValue(
      ok({ payments: [{ id: 'p1', userId: 'u', paymentFor: 'MEMBERSHIP', amount: 100, method: 'CASH', status: 'PENDING', createdAt: '2026-10-01T10:00:00Z', user: { fullName: 'Ali Raza' } }] }) as never
    )
    wrap(<BranchDetailPage />)
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /payments/i }))
    await screen.findByText('Ali Raza')
  }

  it('Front Desk: collect and reject, no final approval', async () => {
    await open(frontDeskContext)
    expect(screen.getByTitle('Mark as Collected')).toBeInTheDocument()
    expect(screen.getByTitle('Reject')).toBeInTheDocument()
    expect(screen.queryByTitle('Final Approval')).not.toBeInTheDocument()
  })

  it('someone with payments.verify at the branch gets final approval whatever their account role', async () => {
    await open(withPermissions(frontDeskContext, ['payments.verify']))
    expect(screen.getByTitle('Final Approval')).toBeInTheDocument()
  })

  it('the owner is unchanged', async () => {
    accountRole = 'GYM_HOST'
    await open(ownerContext)
    expect(screen.getByTitle('Final Approval')).toBeInTheDocument()
    expect(screen.getByTitle('Reject')).toBeInTheDocument()
  })
})

describe('The user’s role is their team role, not MEMBER (NEW-45g)', () => {
  const sidebar = async (context: MyContext) => {
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
    wrap(<Sidebar />)
    await screen.findAllByText('Sana Malik')
  }

  it('the sidebar shows "Front Desk" for a Front Desk user', async () => {
    await sidebar(frontDeskContext)
    await screen.findAllByText('Front Desk')
    expect(screen.queryByText('MEMBER')).not.toBeInTheDocument()
  })

  it('the sidebar shows "Owner" for the owner', async () => {
    accountRole = 'GYM_HOST'
    await sidebar(ownerContext)
    expect((await screen.findAllByText('Owner')).length).toBeGreaterThan(0)
    expect(screen.queryByText('GYM HOST')).not.toBeInTheDocument()
  })

  it('the top bar menu shows the same label', async () => {
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(frontDeskContext) as never)
    vi.spyOn(notificationsApi, 'getNotifications').mockResolvedValue(ok({ notifications: [] }) as never)
    vi.spyOn(notificationsApi, 'getUnreadCount').mockResolvedValue(ok({ unreadCount: 0 }) as never)
    const { RealHeader } = (await import('@/components/layout/header')) as any
    wrap(<RealHeader title="Dashboard" />)
    fireEvent.pointerDown(await screen.findByRole('button', { name: /sana|user|account|profile/i }), { button: 0, ctrlKey: false })
    expect(await screen.findByText('Front Desk')).toBeInTheDocument()
    expect(screen.queryByText('MEMBER')).not.toBeInTheDocument()
  })
})
