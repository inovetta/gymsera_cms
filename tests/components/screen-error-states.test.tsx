import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MembersPage from '@/app/(dashboard)/gym/members/page'
import MemberDetailPage from '@/app/(dashboard)/gym/members/[id]/page'
import BranchDetailPage from '@/app/(dashboard)/gym/branches/[id]/page'
import PlansPage from '@/app/(dashboard)/gym/plans/page'
import GymProfilePage from '@/app/(dashboard)/gym/profile/page'
import CitiesPage from '@/app/(dashboard)/admin/cities/page'
import BillingSettingsPage from '@/app/(dashboard)/settings/billing/page'
import TenantsPage from '@/app/(dashboard)/admin/tenants/page'
import { gymApi } from '@/lib/api/gym'
import { plansApi } from '@/lib/api/plans'
import { usersApi } from '@/lib/api/users'
import { citiesApi } from '@/lib/api/cities'
import { adminApi } from '@/lib/api/admin'
import { subscriptionsApi } from '@/lib/api/subscriptions'
import { attendanceApi } from '@/lib/api/attendance'
import { paymentsApi } from '@/lib/api/payments'
import { reportsApi } from '@/lib/api/reports'
import { hostBillingApi } from '@/lib/api/host-billing'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: 'id-1' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u', fullName: 'Test Person', role: 'GYM_HOST' },
    logout: vi.fn(),
    isPlatformAdmin: true,
    isGymHost: true,
    isBranchManager: false,
  }),
}))

const serverDown = {
  response: { status: 503, data: { error: { code: 'internal_error', message: 'Service unavailable', requestId: 'req_state_1' } } },
}
const noNetwork = { message: 'Network Error' }

const renderPage = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

/** A failed load is not an empty list: the page says it failed, quotes the reference, and offers Retry. */
async function expectRetryableError(emptyText: RegExp) {
  const state = await screen.findByTestId('error-state')
  expect(state).toHaveTextContent('req_state_1')
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  expect(screen.queryByText(emptyText)).toBeNull()
}

describe('screens show a retryable error instead of an empty or blank page (UX-08, spec §2.5)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('members list', async () => {
    vi.spyOn(gymApi, 'getMembers').mockRejectedValue(serverDown)
    vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
    vi.spyOn(plansApi, 'getHostPlans').mockResolvedValue(ok({ plans: [] }) as never)
    renderPage(<MembersPage />)
    await expectRetryableError(/no members found/i)
  })

  it('members list: Retry calls the query again and recovers', async () => {
    const spy = vi
      .spyOn(gymApi, 'getMembers')
      .mockRejectedValueOnce(serverDown)
      .mockResolvedValue(ok({ members: [], pagination: { totalPages: 1 } }) as never)
    vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
    vi.spyOn(plansApi, 'getHostPlans').mockResolvedValue(ok({ plans: [] }) as never)
    renderPage(<MembersPage />)
    fireEvent.click(await screen.findByRole('button', { name: /retry/i }))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/no members found/i)).toBeInTheDocument()
  })

  it('membership plans (card grid)', async () => {
    vi.spyOn(plansApi, 'getHostPlans').mockRejectedValue(serverDown)
    vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
    renderPage(<PlansPage />)
    await expectRetryableError(/no plans yet/i)
  })

  it('gym profile: the edit form is not shown over data that never loaded', async () => {
    vi.spyOn(gymApi, 'getGymProfile').mockRejectedValue(serverDown)
    renderPage(<GymProfilePage />)
    await expectRetryableError(/gym name/i)
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
  })

  it('member detail', async () => {
    vi.spyOn(usersApi, 'getUser').mockRejectedValue(serverDown)
    vi.spyOn(subscriptionsApi, 'getStaffSubscriptions').mockResolvedValue(ok({ subscriptions: [] }) as never)
    vi.spyOn(attendanceApi, 'getAttendance').mockResolvedValue(ok({ logs: [] }) as never)
    vi.spyOn(paymentsApi, 'getPayments').mockResolvedValue(ok({ payments: [] }) as never)
    renderPage(<MemberDetailPage />)
    await expectRetryableError(/back to members/i)
  })

  it('branch detail', async () => {
    vi.spyOn(gymApi, 'getBranch').mockRejectedValue(serverDown)
    vi.spyOn(gymApi, 'getBranchStaff').mockResolvedValue(ok({ staff: [] }) as never)
    vi.spyOn(subscriptionsApi, 'getStaffSubscriptions').mockResolvedValue(ok({ subscriptions: [] }) as never)
    vi.spyOn(attendanceApi, 'getAttendance').mockResolvedValue(ok({ logs: [] }) as never)
    vi.spyOn(paymentsApi, 'getPayments').mockResolvedValue(ok({ payments: [] }) as never)
    vi.spyOn(reportsApi, 'getBranchReport').mockResolvedValue(ok({}) as never)
    renderPage(<BranchDetailPage />)
    await expectRetryableError(/back to branches/i)
  })

  it('admin cities', async () => {
    vi.spyOn(citiesApi, 'getCities').mockRejectedValue(serverDown)
    renderPage(<CitiesPage />)
    await expectRetryableError(/no cities yet/i)
  })

  it('admin tenants table: a network failure says it could not reach the server', async () => {
    vi.spyOn(adminApi, 'getTenants').mockRejectedValue(noNetwork)
    renderPage(<TenantsPage />)
    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument()
    expect(screen.queryByText(/no tenants found/i)).toBeNull()
  })

  describe('billing settings: only a 404 means "no plan"', () => {
    const stubOthers = () => {
      vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't', status: 'ACTIVE' } }) as never)
      vi.spyOn(hostBillingApi, 'getBranchQuota').mockResolvedValue(ok({}) as never)
      vi.spyOn(hostBillingApi, 'getCatalog').mockResolvedValue(ok([]) as never)
      vi.spyOn(tenantsApi, 'getPackages').mockResolvedValue(ok([]) as never)
    }

    it('a 503 shows the error with Retry and not "No active subscription"', async () => {
      stubOthers()
      vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockRejectedValue(serverDown)
      renderPage(<BillingSettingsPage />)
      await expectRetryableError(/no active subscription yet/i)
    })

    it('a 404 is the normal no-plan state', async () => {
      stubOthers()
      vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockRejectedValue({
        response: { status: 404, data: { message: 'No subscription' } },
      })
      renderPage(<BillingSettingsPage />)
      expect(await screen.findByText(/no active subscription yet/i)).toBeInTheDocument()
      expect(screen.queryByTestId('error-state')).toBeNull()
    })
  })
})
