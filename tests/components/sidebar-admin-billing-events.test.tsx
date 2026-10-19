import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/sidebar'
import { approvalsApi } from '@/lib/api/approvals'
import { tenantsApi } from '@/lib/api/tenants'
import { meApi } from '@/lib/api/me'
import { ok } from '../fixtures/team'
import { ownerContext } from '../fixtures/context'

// OBS-05: "Billing Events" sits in the Platform Admin section, so only platform admins see it.
let isPlatformAdmin = true
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', fullName: 'Some Person', role: isPlatformAdmin ? 'PLATFORM_ADMIN' : 'GYM_HOST' },
    logout: vi.fn(),
    isPlatformAdmin,
    isGymHost: !isPlatformAdmin,
    isBranchManager: false,
  }),
}))

const renderSidebar = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
  vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
  return render(
    <QueryClientProvider client={queryClient}>
      <Sidebar />
    </QueryClientProvider>
  )
}
const nav = async () => (await screen.findAllByRole('navigation'))[0]

describe('Sidebar: Billing Events (OBS-05)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('a platform admin sees the link, in the Platform Admin section', async () => {
    isPlatformAdmin = true
    renderSidebar()
    const link = await within(await nav()).findByRole('link', { name: /billing events/i })
    expect(link).toHaveAttribute('href', '/admin/billing-events')
  })

  it('a gym host does not', async () => {
    isPlatformAdmin = false
    renderSidebar()
    await within(await nav()).findByRole('link', { name: /dashboard/i })
    expect(within(await nav()).queryByRole('link', { name: /billing events/i })).toBeNull()
  })
})
