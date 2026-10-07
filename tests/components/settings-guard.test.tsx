import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SettingsLayout from '@/app/(dashboard)/settings/layout'
import { meApi } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { branchManagerContext, ownerContext } from '../fixtures/context'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}))

let authUser = { id: 'user-1', fullName: 'Test User', role: 'MEMBER' }
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: authUser,
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: authUser.role === 'GYM_HOST',
    isBranchManager: false,
  }),
}))

const renderLayout = (ui: React.ReactNode = <div>Settings Page Content</div>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsLayout>{ui}</SettingsLayout>
    </QueryClientProvider>
  )
}

describe('SettingsLayout Guard (NEW-46d)', () => {
  beforeEach(() => {
    replace.mockClear()
    authUser = { id: 'user-1', fullName: 'Test User', role: 'MEMBER' }
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' } }) as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects non-owners of the selected organization to /dashboard', async () => {
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(branchManagerContext) as never)

    renderLayout()

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dashboard')
    })
    expect(screen.queryByText('Settings Page Content')).not.toBeInTheDocument()
  })

  it('renders settings content for the owner of the organization', async () => {
    authUser = { id: 'user-1', fullName: 'Owner User', role: 'GYM_HOST' }
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)

    renderLayout()

    expect(await screen.findByText('Settings Page Content')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
