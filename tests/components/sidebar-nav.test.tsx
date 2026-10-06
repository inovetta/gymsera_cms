import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/sidebar'
import { approvalsApi } from '@/lib/api/approvals'
import { tenantsApi } from '@/lib/api/tenants'
import { apiError, ok } from '../fixtures/team'

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

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-owner', fullName: 'Hira Khan', role: 'GYM_HOST' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: true,
    isBranchManager: false,
  }),
}))

const renderSidebar = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  return render(
    <QueryClientProvider client={queryClient}>
      <Sidebar />
    </QueryClientProvider>
  )
}

// The desktop sidebar is the first of the two renders (desktop + mobile drawer).
const nav = async () => (await screen.findAllByRole('navigation'))[0]

describe('Sidebar — Approvals (UX-13)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('links to /gym/approvals with the number of requests waiting on the user', async () => {
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) as never)
    renderSidebar()

    const link = await within(await nav()).findByRole('link', { name: /approvals/i })
    expect(link).toHaveAttribute('href', '/gym/approvals')
    expect(await within(link).findByLabelText('3 waiting')).toHaveTextContent('3')
  })

  it('shows no badge when nothing is waiting or the inbox is not theirs to see (403)', async () => {
    vi.spyOn(approvalsApi, 'list').mockRejectedValue(apiError(403, 'You do not have permission to see the approval inbox here'))
    renderSidebar()

    const link = await within(await nav()).findByRole('link', { name: /approvals/i })
    expect(within(link).queryByLabelText(/waiting/i)).not.toBeInTheDocument()
  })
})
