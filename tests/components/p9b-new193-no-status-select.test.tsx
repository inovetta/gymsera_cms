import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { hostApi } from '@/lib/api/host'
import { organizationsApi } from '@/lib/api/organizations'
import { citiesApi } from '@/lib/api/cities'
import { meApi } from '@/lib/api/me'
import { ok } from '../fixtures/team'
import { ownerContext } from '../fixtures/context'
import { fakePlaces } from '../fixtures/places'

/**
 * Phase 7 P9b item 7, NEW-193. Before: the /gym/branches edit form offered a Status select
 * (Active / Inactive) and sent `status`; the API refuses any change there (gym.service.js:765,
 * 400 branch_status_immutable_here) because status moves only through delete / restore and
 * pause / resume, which settle branch capacity. Decision: remove the option (the app has none).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Hira Khan', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

const b1 = { id: 'b1', branchName: 'Uptown', status: 'ACTIVE', address: '1 Mall Road', cityId: 7, businessId: 'listing-1', pausedAt: null, latitude: 31.5, longitude: 74.3 }
let updateBranch: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fakePlaces()
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
  vi.spyOn(organizationsApi, 'getMine').mockResolvedValue(ok({ organization: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([{ id: 7, name: 'Lahore' }]) as never)
  vi.spyOn(hostApi, 'getBusinesses').mockResolvedValue(ok([{ id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }]) as never)
  vi.spyOn(hostApi, 'getBusinessBranches').mockResolvedValue(ok({ branches: [b1] }) as never)
  vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 6, usedBranches: 1, remainingBranches: 5, activeBranches: 1, buildableBranches: 5, overQuotaCount: 0 }) as never)
  vi.spyOn(hostApi, 'getBusinessQuota').mockResolvedValue(ok({ pool: { max: 3, used: 2, reserved: 0, free: 1 }, canAddBusiness: true, blockingBusinessStatus: null }) as never)
  vi.spyOn(organizationsApi, 'getBranches').mockResolvedValue(ok({ branches: [b1] }) as never)
  updateBranch = vi.spyOn(organizationsApi, 'updateBranch').mockResolvedValue(ok({ branch: b1 }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('NEW-193: the branch edit form has no Status select', () => {
  it('offers no Status field and never sends status', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
        <BranchesPage />
      </QueryClientProvider>
    )
    await screen.findByTestId('branch-card-b1')
    fireEvent.click(within(screen.getByTestId('branch-card-b1')).getByRole('button', { name: 'Edit Branch' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText('Status')).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /save|update/i }))
    await waitFor(() => expect(updateBranch).toHaveBeenCalledTimes(1))
    expect(updateBranch.mock.calls[0][1]).not.toHaveProperty('status')
  })
})
