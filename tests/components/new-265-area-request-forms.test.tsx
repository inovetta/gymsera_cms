import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { hostApi } from '@/lib/api/host'
import { organizationsApi } from '@/lib/api/organizations'
import { citiesApi } from '@/lib/api/cities'
import { meApi } from '@/lib/api/me'
import { areaRequestsApi } from '@/lib/api/area-requests'
import { ok } from '../fixtures/team'
import { ownerContext } from '../fixtures/context'
import { fakePlaces, pickPlace } from '../fixtures/places'
import { branchFixture, renderEditor } from '../fixtures/listing'

/**
 * NEW-265 Part A (A4, A7, R-109 F7): the host forms that write an area send `areaRequestId` when the
 * host kept a typed area (New organization → POST /host/listings, Add branch → POST /host/branches,
 * Listing › Location → PATCH listing-content), never with an `areaId`; an existing pending area is shown
 * as "(under review)" and kept when the host saves other fields.
 */
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'branch-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Hira Khan', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

beforeEach(() => {
  fakePlaces() // area searches starting with "zz" have no Google match
  vi.spyOn(areaRequestsApi, 'check').mockImplementation((async (_city: number, name: string) =>
    ok({ name, match: null, similar: [], canRequest: true, reason: null })) as never)
  vi.spyOn(areaRequestsApi, 'create').mockImplementation((async (cityId: number, name: string) =>
    ok({ areaRequest: { id: 5, cityId, name, status: 'pending_review', source: 'typed' } })) as never)
})
afterEach(() => vi.restoreAllMocks())

const keepTypedArea = async (root: HTMLElement, typed: string) => {
  const area = within(root).getByLabelText('Area')
  fireEvent.focus(area)
  fireEvent.change(area, { target: { value: typed } })
  fireEvent.click(await within(root).findByRole('button', { name: new RegExp(`keep “${typed}”`, 'i') }))
  expect(await within(root).findByTestId('area-status')).toHaveTextContent(`${typed} (under review)`)
}

const mountBranches = () => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
  vi.spyOn(organizationsApi, 'getMine').mockResolvedValue(ok({ organization: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([{ id: 7, name: 'Lahore' }]) as never)
  vi.spyOn(citiesApi, 'getAreas').mockResolvedValue(ok({ areas: [] }) as never)
  vi.spyOn(hostApi, 'getBusinesses').mockResolvedValue(ok([{ id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }]) as never)
  vi.spyOn(hostApi, 'getBusinessBranches').mockResolvedValue(ok({ branches: [] }) as never)
  vi.spyOn(hostApi, 'getAllBranches').mockResolvedValue(ok({ branches: [] }) as never)
  vi.spyOn(hostApi, 'getBusinessQuota').mockResolvedValue(ok({ pool: { max: 3, used: 2, reserved: 0, free: 1 }, canAddBusiness: true, blockingBusinessStatus: null }) as never)
  vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 3, usedBranches: 1, remainingBranches: 2, activeBranches: 1, buildableBranches: 2, overQuotaCount: 0 }) as never)
  vi.spyOn(organizationsApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <BranchesPage />
    </QueryClientProvider>
  )
}

describe('NEW-265: host forms send the area request', () => {
  it('Add branch → POST /host/branches with areaRequestId, no areaId', async () => {
    const createBranch = vi.spyOn(hostApi, 'createBranch').mockResolvedValue(ok({ branch: { id: 'b3' } }) as never)
    mountBranches()
    fireEvent.click((await screen.findAllByRole('button', { name: /add branch/i }))[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText(/main branch, gulberg/i), { target: { value: 'North' } })
    await pickPlace('City', 'Lah', /Lahore/, dialog)
    await keepTypedArea(dialog, 'Zz Town')
    fireEvent.change(within(dialog).getByLabelText('Address', { exact: true }), { target: { value: '1 Road' } })
    fireEvent.change(within(dialog).getByLabelText(/plan name/i), { target: { value: 'Monthly' } })
    fireEvent.change(within(dialog).getByLabelText(/^price/i), { target: { value: '4000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^create branch$/i }))

    await waitFor(() => expect(createBranch).toHaveBeenCalledTimes(1))
    expect(createBranch.mock.calls[0][0]).toMatchObject({ cityId: 7, areaRequestId: 5 })
    expect(createBranch.mock.calls[0][0]).not.toHaveProperty('areaId')
  })

  it('New organization → POST /host/listings with areaRequestId', async () => {
    const createListing = vi.spyOn(hostApi, 'createBusiness').mockResolvedValue(ok({ id: 'listing-3', title: 'Peak', status: 'PENDING' }) as never)
    mountBranches()
    fireEvent.click(await screen.findByRole('button', { name: /new organization/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText(/organization name/i), { target: { value: 'Peak Fitness' } })
    fireEvent.change(within(dialog).getByLabelText(/description/i), { target: { value: 'A new gym' } })
    await pickPlace('City', 'Lah', /Lahore/, dialog)
    await keepTypedArea(dialog, 'Zz Colony')
    fireEvent.change(within(dialog).getByLabelText('Address', { exact: true }), { target: { value: '12 Mall Road' } })
    fireEvent.change(within(dialog).getByLabelText(/first plan/i), { target: { value: 'Monthly' } })
    fireEvent.change(within(dialog).getByLabelText(/^price/i), { target: { value: '3000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /create organization/i }))

    await waitFor(() => expect(createListing).toHaveBeenCalledTimes(1))
    expect(createListing.mock.calls[0][0]).toMatchObject({ cityId: 7, areaRequestId: 5 })
    expect(createListing.mock.calls[0][0]).not.toHaveProperty('areaId')
  })

  it('Listing › Location: a pending area is shown; keeping a typed area sends areaRequestId', async () => {
    vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([{ id: 1, name: 'Lahore', isActive: true, createdAt: '', areas: [] }]) as never)
    const pending = { ...branchFixture, areaId: null, pendingArea: { requestId: 4, name: 'Old Request', status: 'pending_review', rejectReason: null } }
    const { patch } = renderEditor(undefined, pending as never)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Location & Map' }))
    expect(screen.getByTestId('area-status')).toHaveTextContent('Old Request (under review)')

    // Saving another field keeps the request (no area keys sent).
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '14 Main Road' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch.mock.calls[0][1]).not.toHaveProperty('areaId')
    expect(patch.mock.calls[0][1]).not.toHaveProperty('areaRequestId')
  })
})

describe('NEW-265 (R-109 F7): admins see the area request instead of an empty area', () => {
  it('admin tenant › Branches shows "under review" and a refused area with its reason', async () => {
    const { adminApi } = await import('@/lib/api/admin')
    const { BranchesTab } = await import('@/components/features/admin-organization/branches-tab')
    const base = { status: 'ACTIVE', address: 'x', businessId: 'listing-1', pausedAt: null, billingLockedAt: null, travelerVisibilityStatus: 'active' }
    vi.spyOn(adminApi, 'getOrganizationBranches').mockResolvedValue(ok({
      branches: [
        { ...base, id: 'b1', branchName: 'Uptown', pendingArea: { requestId: 4, name: 'Shinwari Town', status: 'pending_review', rejectReason: null } },
        { ...base, id: 'b2', branchName: 'Downtown', pendingArea: { requestId: 5, name: 'Fake Place', status: 'rejected', rejectReason: 'Not in Peshawar' } },
      ],
    }) as never)
    vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([]) as never)
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BranchesTab organization={{ id: 't1', status: 'ACTIVE', organizations: [] } as never} organizationId="t1" />
      </QueryClientProvider>
    )
    const notes = await screen.findAllByTestId('pending-area')
    expect(notes.map((n) => n.textContent)).toEqual([
      'Area “Shinwari Town” under review',
      'Area “Fake Place” not accepted: Not in Peshawar',
    ])
  })
})
