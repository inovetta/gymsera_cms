import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { BranchesTab } from '@/components/features/admin-tenant/branches-tab'
import { hostApi } from '@/lib/api/host'
import { gymApi } from '@/lib/api/gym'
import { citiesApi } from '@/lib/api/cities'
import { meApi } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { adminApi } from '@/lib/api/admin'
import { branchStates } from '@/lib/branches/states'
import { ok } from '../fixtures/team'
import { ownerContext } from '../fixtures/context'
import { fakePlaces } from '../fixtures/places'

/**
 * Phase 7 P9b item 4 (P5 branch lists, R-81, R-82, R-83). Before: /gym/branches showed Paused but
 * never a branch locked for billing, nor whether travellers see the branch (the app's IN REVIEW /
 * ACTIVE / DEACTIVATED label); the admin tenant Branches tab showed neither Paused nor Locked. A lock
 * reason from the API is a developer sentence (branch-billing-lock.service.js:153), so it is said
 * in plain words.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Hira Khan', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

const OVER = 'Account over branch capacity following subscription change'
const ENDED = 'The plan has ended: no branch is covered until a plan is active again'
const live = { id: 'b1', branchName: 'Uptown', status: 'ACTIVE', address: 'x', gymListingId: 'listing-1', pausedAt: null, billingLockedAt: null, travelerVisibilityStatus: 'active' }
const paused = { ...live, id: 'b2', branchName: 'Quiet', pausedAt: '2026-10-30T10:00:00Z' }
const locked = { ...live, id: 'b3', branchName: 'Mall Road', billingLockedAt: '2026-10-29T00:00:00Z', billingLockReason: OVER }
const review = { ...live, id: 'b4', branchName: 'New One', travelerVisibilityStatus: 'pending' }
const off = { ...live, id: 'b5', branchName: 'Closed Off', travelerVisibilityStatus: 'deactivated', deactivationReason: 'Photos are not of a gym' }

const mount = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

beforeEach(() => {
  fakePlaces()
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([]) as never)
  vi.spyOn(hostApi, 'getListings').mockResolvedValue(ok([{ id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }]) as never)
  vi.spyOn(hostApi, 'getListingBranches').mockResolvedValue(ok({ branches: [live, paused, locked, review, off] }) as never)
  vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 6, usedBranches: 5, remainingBranches: 1, activeBranches: 5, buildableBranches: 1, overQuotaCount: 0 }) as never)
  vi.spyOn(hostApi, 'getOrganizationQuota').mockResolvedValue(ok({ maxOrganizations: 3, canCreateNext: true, blockingListingStatus: null }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('branchStates (one rule for both lists)', () => {
  it('names the lock reason in plain words, never the API sentence', () => {
    const over = branchStates(locked)
    expect(over.map((s) => s.label)).toContain('Locked')
    expect(over.find((s) => s.key === 'locked')?.reason).toMatch(/over your plan's branch limit/i)
    expect(JSON.stringify(over)).not.toContain(OVER)
    expect(branchStates({ ...locked, billingLockReason: ENDED }).find((s) => s.key === 'locked')?.reason).toMatch(/plan has ended/i)
  })
  it('a live branch has no warning state', () => {
    expect(branchStates(live).filter((s) => s.tone !== 'ok')).toEqual([])
  })
})

describe('/gym/branches: each branch says its state and why', () => {
  it('paused, locked, in review and deactivated branches say so, with the reason', async () => {
    mount(<BranchesPage />)
    await screen.findByTestId('branch-card-b1')
    expect(within(screen.getByTestId('branch-card-b1')).getByText('Visible to travellers')).toBeInTheDocument()
    expect(within(screen.getByTestId('branch-card-b2')).getByText('Paused')).toBeInTheDocument()
    const lockedCard = screen.getByTestId('branch-card-b3')
    expect(within(lockedCard).getByText('Locked')).toBeInTheDocument()
    expect(within(lockedCard).getByText(/over your plan's branch limit/i)).toBeInTheDocument()
    expect(within(screen.getByTestId('branch-card-b4')).getByText('In review')).toBeInTheDocument()
    const offCard = screen.getByTestId('branch-card-b5')
    expect(within(offCard).getByText('Hidden by GymsEra')).toBeInTheDocument()
    expect(within(offCard).getByText(/Photos are not of a gym/)).toBeInTheDocument()
  })
})

describe('Admin tenant Branches tab: paused and locked too', () => {
  it('shows Paused and Locked with the reason', async () => {
    vi.spyOn(adminApi, 'getTenantBranches').mockResolvedValue(ok({ branches: [live, paused, locked] }) as never)
    mount(<BranchesTab tenant={{ id: 't1', status: 'ACTIVE', organizations: [] } as never} tenantId="t1" />)
    const row = await screen.findByTestId('admin-branch-b3')
    expect(within(row).getByText('Locked')).toBeInTheDocument()
    expect(within(row).getByText(/over your plan's branch limit/i)).toBeInTheDocument()
    expect(within(screen.getByTestId('admin-branch-b2')).getByText('Paused')).toBeInTheDocument()
  })
})
