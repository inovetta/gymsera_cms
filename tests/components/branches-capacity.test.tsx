import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { hostApi } from '@/lib/api/host'
import { gymApi } from '@/lib/api/gym'
import { citiesApi } from '@/lib/api/cities'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { ownerContext, orgAdminContext } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))

let accountRole = 'GYM_HOST'
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Hira Khan', role: accountRole },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: accountRole === 'GYM_HOST',
    isBranchManager: false,
  }),
}))

const render_ = (context: MyContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <BranchesPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'GYM_HOST'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([]) as never)
  vi.spyOn(hostApi, 'getOrganizationQuota').mockResolvedValue(ok({ maxOrganizations: 3, canCreateNext: true, blockingListingStatus: null }) as never)
  vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(
    ok({ maxBranches: 6, usedBranches: 5, remainingBranches: 1, activeBranches: 5, buildableBranches: 1, overQuotaCount: 0 }) as never
  )
})
afterEach(() => vi.restoreAllMocks())

describe('Branches page — capacity banner (Prompt 3B)', () => {
  it('the owner sees the tenant-wide capacity banner, from one request', async () => {
    render_(ownerContext)

    expect(await screen.findByText('5 of 6 branches used')).toBeInTheDocument()
    expect(hostApi.getBranchQuota).toHaveBeenCalledTimes(1)
  })

  it('someone who is not the owner never requests it (the route is owner-only)', async () => {
    accountRole = 'MEMBER'
    render_(orgAdminContext)

    await screen.findByText('Branches', { selector: 'h2' })
    await new Promise((r) => setTimeout(r, 50))
    expect(hostApi.getBranchQuota).not.toHaveBeenCalled()
    expect(screen.queryByText(/branches used/)).not.toBeInTheDocument()
  })
})
