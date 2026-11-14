/**
 * NEW-244: the Members list Status column is the member's plan status, as the app shows it
 * (Active, Expiring soon, Expired, On hold, Pending), not the account status. The account status
 * has its own column. The "All Status" filter sends the same values as `membershipStatus`.
 *
 * Owner report (2026-11-13): branch "savvvv", four members, all "Active" in the CMS; the app showed
 * two as Expired (end dates 2026-10-13 and 2026-11-12).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MembersPage from '@/app/(dashboard)/gym/members/page'
import { gymApi } from '@/lib/api/gym'
import { ok } from '../fixtures/team'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/gym/members',
}))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u', fullName: 'Test Host', role: 'GYM_HOST' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: true,
    isBranchManager: false,
  }),
}))
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select aria-label="status filter" value={value ?? ''} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

const member = (id: string, name: string, extra: Record<string, unknown>) => ({
  id,
  fullName: name,
  email: `${id}@example.test`,
  phone: null,
  status: 'ACTIVE',
  createdAt: '2026-09-01T10:00:00.000Z',
  planName: 'Monthly',
  branchName: 'savvvv',
  ...extra,
})

const MEMBERS = [
  member('m1', 'Ayesha Active', { membershipStatus: 'ACTIVE', subscriptionStatus: 'ACTIVE', endDate: '2027-01-10' }),
  member('m2', 'Bilal Lapsed', { membershipStatus: 'EXPIRED', subscriptionStatus: 'ACTIVE', endDate: '2026-10-13' }),
  member('m3', 'Chand Lapsed', { membershipStatus: 'EXPIRED', subscriptionStatus: 'ACTIVE', endDate: '2026-11-12' }),
  member('m4', 'Dua Soon', { membershipStatus: 'EXPIRING', subscriptionStatus: 'ACTIVE', endDate: '2026-11-15' }),
  member('m5', 'Erum Hold', { membershipStatus: 'FROZEN', subscriptionStatus: 'FROZEN', endDate: '2027-02-01' }),
  member('m6', 'Faraz Waiting', { membershipStatus: 'PENDING', subscriptionStatus: 'PENDING', endDate: '2026-12-13' }),
  member('m7', 'Gul Cancelled', { membershipStatus: 'EXPIRED', subscriptionStatus: 'CANCELLED', endDate: '2026-12-01' }),
  member('m8', 'Hamza Blocked', { membershipStatus: 'ACTIVE', subscriptionStatus: 'ACTIVE', endDate: '2027-03-01', status: 'SUSPENDED' }),
]

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersPage />
    </QueryClientProvider>
  )
}

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement

describe('NEW-244: Members list shows the plan status like the app', () => {
  afterEach(() => vi.restoreAllMocks())

  const mockList = () => {
    vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
    return vi
      .spyOn(gymApi, 'getMembers')
      .mockResolvedValue({ ...ok({ members: MEMBERS }), pagination: { total: MEMBERS.length, totalPages: 1 } } as never)
  }

  it('the Status column is the plan status, not the account', async () => {
    mockList()
    renderPage()
    expect(within(await rowOf('Ayesha Active')).getByTestId('membership-status')).toHaveTextContent('Active')
    expect(within(await rowOf('Bilal Lapsed')).getByTestId('membership-status')).toHaveTextContent('Expired')
    expect(within(await rowOf('Chand Lapsed')).getByTestId('membership-status')).toHaveTextContent('Expired')
    expect(within(await rowOf('Dua Soon')).getByTestId('membership-status')).toHaveTextContent('Expiring soon')
    expect(within(await rowOf('Erum Hold')).getByTestId('membership-status')).toHaveTextContent('On hold')
    expect(within(await rowOf('Faraz Waiting')).getByTestId('membership-status')).toHaveTextContent('Pending')
    expect(within(await rowOf('Gul Cancelled')).getByTestId('membership-status')).toHaveTextContent('Expired')
  })

  it('the account status has its own column', async () => {
    mockList()
    renderPage()
    expect(screen.getByRole('columnheader', { name: 'Account' })).toBeInTheDocument()
    const blocked = await rowOf('Hamza Blocked')
    expect(within(blocked).getByTestId('membership-status')).toHaveTextContent('Active')
    expect(within(blocked).getByTestId('account-status')).toHaveTextContent('Suspended')
  })

  it('the plan and its end date are shown, and a cancelled plan says so on hover', async () => {
    mockList()
    renderPage()
    const lapsed = await rowOf('Bilal Lapsed')
    expect(within(lapsed).getByText('Monthly')).toBeInTheDocument()
    expect(within(lapsed).getByText(/Ended 13 Oct 2026 · savvvv/)).toBeInTheDocument()
    const cancelled = await rowOf('Gul Cancelled')
    expect(within(cancelled).getByTestId('membership-status')).toHaveAttribute('title', expect.stringMatching(/cancelled/i))
  })

  it('the status filter offers the app values and sends them as membershipStatus', async () => {
    const spy = mockList()
    renderPage()
    await screen.findByText('Ayesha Active')
    const filter = screen.getByLabelText('status filter')
    const options = within(filter).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['All Status', 'Active', 'Expiring soon', 'Expired', 'On hold', 'Pending'])

    fireEvent.change(filter, { target: { value: 'EXPIRED' } })
    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ membershipStatus: 'EXPIRED' }))
    )
    const last = spy.mock.calls[spy.mock.calls.length - 1][0] as Record<string, unknown>
    expect(last.status).toBeUndefined()
  })
})
