import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/sidebar'
import { meApi } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { approvalsApi } from '@/lib/api/approvals'
import { useSelectedOrgStore } from '@/stores/selected-org.store'
import { ok } from '../fixtures/team'
import { twoOrgContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

let authUser = { id: 'user-1', fullName: 'Test User', role: 'GYM_HOST' }
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: authUser,
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: true,
    isBranchManager: false,
  }),
}))

describe('Sidebar Loading State (NEW-46c)', () => {
  beforeEach(() => {
    localStorage.clear()
    useSelectedOrgStore.setState({ tenantId: 'tenant-a' })
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('switching organization never shows a reduced menu mid-load, showing skeleton items until loaded', async () => {
    let resolveTenant: (value: any) => void = () => {}
    const pendingTenantPromise = new Promise((resolve) => {
      resolveTenant = resolve
    })

    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(twoOrgContext) as never)
    // Initially loaded tenant
    vi.spyOn(tenantsApi, 'getMyTenant').mockImplementationOnce(() =>
      Promise.resolve(ok({ tenant: { id: 'tenant-a', status: 'ACTIVE' } }) as never)
    )

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <Sidebar />
      </QueryClientProvider>
    )

    // Wait until initially loaded
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Gym Profile' })).toBeInTheDocument()

    // Next time getMyTenant is called (after switcher resetQueries), return the unresolved promise
    vi.spyOn(tenantsApi, 'getMyTenant').mockImplementation(() => pendingTenantPromise as never)

    // Switch organization to tenant-b
    const select = (await screen.findAllByLabelText('Organization'))[0] as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'tenant-b' } })

    // Mid-load: queries are in-flight. Skeletons MUST be shown, not a reduced menu with only Dashboard!
    expect(await screen.findByTestId('nav-skeletons')).toBeInTheDocument()
    expect(screen.getAllByTestId('nav-skeleton-item').length).toBeGreaterThan(0)

    // Resolve the tenant query
    resolveTenant(ok({ tenant: { id: 'tenant-b', status: 'ACTIVE' } }))

    // Once resolved, skeletons should disappear
    await waitFor(() => {
      expect(screen.queryByTestId('nav-skeletons')).not.toBeInTheDocument()
    })
  })
})
