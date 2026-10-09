import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/sidebar'
import { meApi, MyContext } from '@/lib/api/me'
import { approvalsApi } from '@/lib/api/approvals'
import { tenantsApi } from '@/lib/api/tenants'
import { apiError, ok } from '../fixtures/team'
import { branchManagerContext, orgAdminContext, ownerContext, plainMemberContext, twoOrgContext } from '../fixtures/context'
import { useSelectedOrgStore } from '@/stores/selected-org.store'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// The account role the old menu looked at. Set per test.
let accountRole = 'MEMBER'

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: accountRole },
    logout: vi.fn(),
    isPlatformAdmin: accountRole === 'PLATFORM_ADMIN',
    isGymHost: accountRole === 'GYM_HOST',
    isBranchManager: accountRole === 'BRANCH_MANAGER',
  }),
}))

const GYM_PAGES = [
  'Gym Profile', 'Branches', 'Plans', 'Members', 'Team & access', 'Approvals',
  'Subscriptions', 'Attendance', 'Payments', 'Invoices', 'Trainers', 'Reports',
]

let getContext: ReturnType<typeof vi.spyOn>
let getMyTenant: ReturnType<typeof vi.spyOn>
let listApprovals: ReturnType<typeof vi.spyOn>

const renderSidebar = (context: MyContext) => {
  getContext = vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <Sidebar />
    </QueryClientProvider>
  )
}

/** Menu titles, once the queries have been answered and the menu has settled. */
const menu = async () => {
  await screen.findByRole('link', { name: 'Dashboard' })
  await new Promise((r) => setTimeout(r, 50))
  const nav = screen.getAllByRole('navigation')[0]
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent?.replace(/\d+$/, '').trim())
}

beforeEach(() => {
  accountRole = 'MEMBER'
  // A team member is not the tenant owner: the owner-only tenant endpoint refuses them.
  getMyTenant = vi.spyOn(tenantsApi, 'getMyTenant').mockRejectedValue(apiError(403, 'Forbidden'))
  listApprovals = vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Sidebar — menu follows effective permissions, not the account role (NEW-42)', () => {
  it('an Org Admin whose account role is MEMBER sees Team, Approvals, Branches and the other gym pages', async () => {
    renderSidebar(orgAdminContext)

    const titles = await menu()
    expect(titles).toEqual(expect.arrayContaining(['Team & access', 'Approvals', 'Branches']))
    expect(titles).toEqual(['Dashboard', ...GYM_PAGES])
    // Owner-only account pages stay hidden, and the owner-only tenant endpoint is not called.
    expect(titles).not.toContain('Subscription & Billing')
    expect(getContext).toHaveBeenCalledTimes(1)
    expect(getMyTenant).not.toHaveBeenCalled()
  })

  it('a plain member sees no gym pages', async () => {
    renderSidebar(plainMemberContext)

    expect(await menu()).toEqual(['Dashboard'])
    expect(listApprovals).not.toHaveBeenCalled()
  })

  it('a Branch Manager sees only the branch pages — not Team, Approvals, Branches or Gym Profile', async () => {
    renderSidebar(branchManagerContext)

    expect(await menu()).toEqual([
      'Dashboard', 'Plans', 'Members', 'Subscriptions', 'Attendance', 'Payments', 'Invoices', 'Trainers', 'Reports',
    ])
    // No org-wide approvals.view: the inbox would answer 403, so it is not asked.
    expect(listApprovals).not.toHaveBeenCalled()
  })

  it('an account role of BRANCH_MANAGER or GYM_HOST opens nothing by itself', async () => {
    accountRole = 'BRANCH_MANAGER'
    renderSidebar(plainMemberContext)
    expect(await menu()).toEqual(['Dashboard'])
  })

  it('hides a single page when its permission was switched off for that person', async () => {
    const withoutTeam: MyContext = {
      ...orgAdminContext,
      organizations: orgAdminContext.organizations.map((o) => ({
        ...o,
        orgPermissions: o.orgPermissions.filter((k) => !k.startsWith('team.')),
        branches: o.branches.map((b) => ({ ...b, permissions: b.permissions.filter((k) => !k.startsWith('team.')) })),
      })),
    }
    renderSidebar(withoutTeam)

    const titles = await menu()
    expect(titles).not.toContain('Team & access')
    expect(titles).toContain('Approvals')
  })

  it('the owner still sees everything, including the account settings', async () => {
    accountRole = 'GYM_HOST'
    getMyTenant.mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
    renderSidebar(ownerContext)

    expect(await menu()).toEqual(['Dashboard', ...GYM_PAGES, 'Business Profile', 'Subscription & Billing'])
  })

  it('an owner whose organization is not active sees the settings but no gym pages (unchanged)', async () => {
    accountRole = 'GYM_HOST'
    getMyTenant.mockResolvedValue(ok({ tenant: { status: 'SUSPENDED' }, subscription: null }) as never)
    renderSidebar(ownerContext)

    expect(await menu()).toEqual(['Dashboard', 'Business Profile', 'Subscription & Billing'])
  })

  it('shows no gym pages if the permissions cannot be loaded', async () => {
    getContext = vi.spyOn(meApi, 'getContext').mockRejectedValue(apiError(500, 'Server error'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <Sidebar />
      </QueryClientProvider>
    )
    expect(await menu()).toEqual(['Dashboard'])
  })

  it('A GYM_HOST who owns gym A and is Branch Manager at gym B does not see Settings while B is selected (NEW-46d)', async () => {
    accountRole = 'GYM_HOST'
    getMyTenant.mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
    const hostDualContext: MyContext = {
      ...twoOrgContext,
      user: { id: 'user-1', fullName: 'Host User', platformRole: 'GYM_HOST', isHost: true },
      organizations: [
        { ...ownerContext.organizations[0], tenantId: 'tenant-a', name: 'Owned Gym A', isOwner: true },
        { ...branchManagerContext.organizations[0], tenantId: 'tenant-b', name: 'Managed Gym B', isOwner: false },
      ],
    }

    useSelectedOrgStore.setState({ tenantId: 'tenant-b' })
    renderSidebar(hostDualContext)

    const titles = await menu()
    expect(titles).not.toContain('Business Profile')
    expect(titles).not.toContain('Subscription & Billing')
  })
})
