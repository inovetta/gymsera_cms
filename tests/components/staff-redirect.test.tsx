import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { gymApi } from '@/lib/api/gym'
import { approvalsApi } from '@/lib/api/approvals'
import { tenantsApi } from '@/lib/api/tenants'
import { meApi } from '@/lib/api/me'
import { ok } from '../fixtures/team'
import { ownerContext } from '../fixtures/context'

const redirect = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
  usePathname: () => '/dashboard',
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-owner', fullName: 'Hira Khan', role: 'GYM_HOST' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: true,
    isBranchManager: false,
  }),
}))

describe('/gym/staff is retired (UX-12)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('redirects to /gym/team', async () => {
    const { default: StaffPage } = await import('@/app/(dashboard)/gym/staff/page')
    StaffPage()
    expect(redirect).toHaveBeenCalledWith('/gym/team')
  })

  it('the sidebar links to Team & access and no longer to Staff', async () => {
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
    // The menu reads the signed-in user's permissions from GET /me/context (NEW-42).
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
    const { Sidebar } = await import('@/components/layout/sidebar')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <Sidebar />
      </QueryClientProvider>
    )

    const nav = (await screen.findAllByRole('navigation'))[0]
    expect(await within(nav).findByRole('link', { name: 'Team & access' })).toHaveAttribute('href', '/gym/team')
    expect(within(nav).queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument()
    expect(nav.querySelector('a[href="/gym/staff"]')).toBeNull()
    // Trainers stays as its own screen.
    expect(within(nav).getByRole('link', { name: 'Trainers' })).toHaveAttribute('href', '/gym/trainers')
  })

  it('the CMS can no longer grant or remove access through the legacy staff endpoints', () => {
    const legacy = ['listAllStaff', 'createStaff', 'removeStaffUser', 'addStaff', 'removeStaff']
    for (const name of legacy) {
      expect(gymApi).not.toHaveProperty(name)
    }
  })
})
