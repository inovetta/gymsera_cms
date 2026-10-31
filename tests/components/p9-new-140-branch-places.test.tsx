import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { BranchFormDialog } from '@/components/features/branch-form-dialog'
import { hostApi } from '@/lib/api/host'
import { gymApi } from '@/lib/api/gym'
import { citiesApi } from '@/lib/api/cities'
import { meApi } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { apiError, ok } from '../fixtures/team'
import { ownerContext } from '../fixtures/context'
import { fakePlaces, pickPlace, MM_ALAM } from '../fixtures/places'

/**
 * Phase 7 P9, NEW-140: the CMS branch forms take the city, area and address from Google through
 * our API (GET /places/*, server key), as the mobile app does since P3. Before: a fixed list of our
 * cities and areas (GET /cities, GET /cities/:id/areas) and a free-text address with no place id.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({
  MapPicker: ({ onChange }: { onChange: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onChange(31.4, 74.2)}>Drop pin</button>
  ),
}))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Hira Khan', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

let places: ReturnType<typeof fakePlaces>
let createBranch: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  places = fakePlaces()
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([{ id: 1, name: 'Peshawar' }]) as never)
  vi.spyOn(citiesApi, 'getAreas').mockResolvedValue(ok({ areas: [] }) as never)
  vi.spyOn(hostApi, 'getListings').mockResolvedValue(ok([{ id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }]) as never)
  vi.spyOn(hostApi, 'getListingBranches').mockResolvedValue(ok({ branches: [] }) as never)
  vi.spyOn(hostApi, 'getOrganizationQuota').mockResolvedValue(ok({ maxOrganizations: 3, canCreateNext: true, blockingListingStatus: null }) as never)
  vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 3, usedBranches: 1, remainingBranches: 2, activeBranches: 1, buildableBranches: 2, overQuotaCount: 0 }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
  createBranch = vi.spyOn(hostApi, 'createBranch').mockResolvedValue(ok({ branch: { id: 'b3' } }) as never)
})
afterEach(() => vi.restoreAllMocks())

const openAddBranch = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BranchesPage />
    </QueryClientProvider>
  )
  fireEvent.click((await screen.findAllByRole('button', { name: /add branch/i }))[0])
  return screen.findByRole('dialog')
}

describe('NEW-140: Add Branch on /gym/branches', () => {
  it('city, area and address come from /places; the branch is sent with their ids, the point and the place id', async () => {
    const dialog = await openAddBranch()
    fireEvent.change(within(dialog).getByPlaceholderText(/main branch, gulberg/i), { target: { value: 'MM Alam' } })
    await pickPlace('City', 'Lah', /Lahore/, dialog)
    await pickPlace('Area', 'Gul', /Gulberg/, dialog)
    await pickPlace('Address', '12 MM', /12 MM Alam Road/, dialog)
    fireEvent.change(within(dialog).getByLabelText(/plan name/i), { target: { value: 'Monthly' } })
    fireEvent.change(within(dialog).getByLabelText(/^price/i), { target: { value: '4000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^create branch$/i }))

    await waitFor(() => expect(createBranch).toHaveBeenCalledTimes(1))
    expect(createBranch.mock.calls[0][0]).toMatchObject({
      address: MM_ALAM.formattedAddress,
      cityId: 7,
      areaId: 71,
      latitude: 31.5101,
      longitude: 74.3442,
      googlePlaceId: 'addr-mm-alam',
    })
    expect(places.autocomplete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'city', input: 'Lah' }))
    expect(places.autocomplete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'area', cityId: 7 }))
    expect(citiesApi.getAreas).not.toHaveBeenCalled()
  })

  it('one search call per pause in typing, with the same session token for search and pick', async () => {
    const dialog = await openAddBranch()
    const city = within(dialog).getByLabelText('City')
    fireEvent.focus(city)
    for (const v of ['L', 'La', 'Lah', 'Laho']) fireEvent.change(city, { target: { value: v } })
    await within(dialog).findByRole('button', { name: /Lahore/ })
    expect(places.autocomplete).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialog).getByRole('button', { name: /Lahore/ }))
    await waitFor(() => expect(places.details).toHaveBeenCalledTimes(1))
    expect(places.details.mock.calls[0][1].sessionToken).toBe(places.autocomplete.mock.calls[0][0].sessionToken)
  })

  it('an area Google does not know can be typed and is added through POST /places/areas', async () => {
    const dialog = await openAddBranch()
    await pickPlace('City', 'Lah', /Lahore/, dialog)
    const area = within(dialog).getByLabelText('Area')
    fireEvent.focus(area)
    fireEvent.change(area, { target: { value: 'Zzone 9' } })
    fireEvent.click(await within(dialog).findByRole('button', { name: /use “zzone 9” as the area/i }))
    await waitFor(() => expect(places.createArea).toHaveBeenCalledWith(7, 'Zzone 9'))
  })

  it('"Use current location" fills the address, city, area and point from the reverse geocode', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 31.51, longitude: 74.34 } } as GeolocationPosition))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    const dialog = await openAddBranch()
    fireEvent.click(within(dialog).getByRole('button', { name: /use current location/i }))
    await waitFor(() => expect(places.reverseGeocode).toHaveBeenCalledWith(31.51, 74.34))
    expect(await within(dialog).findByDisplayValue(MM_ALAM.formattedAddress as string)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('City')).toHaveValue('Lahore')
    expect(within(dialog).getByLabelText('Latitude')).toHaveValue('31.5101')
  })

  it('location blocked by the browser: a clear message, nothing filled', async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError))
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
    const dialog = await openAddBranch()
    fireEvent.click(within(dialog).getByRole('button', { name: /use current location/i }))
    expect(await within(dialog).findByText(/location is blocked for this site/i)).toBeInTheDocument()
    expect(places.reverseGeocode).not.toHaveBeenCalled()
  })

  it('a Places failure shows the API sentence, never a raw error', async () => {
    places.autocomplete.mockRejectedValue(apiError(503, 'Location search is busy right now. Please try again in a few minutes.', 'places_quota'))
    const dialog = await openAddBranch()
    const city = within(dialog).getByLabelText('City')
    fireEvent.focus(city)
    fireEvent.change(city, { target: { value: 'Lah' } })
    expect(await within(dialog).findByText(/location search is busy right now/i)).toBeInTheDocument()
  })

  it('no plan is invented: the plan name and price start empty and Create waits for them', async () => {
    const dialog = await openAddBranch()
    expect(within(dialog).getByLabelText(/plan name/i)).toHaveValue('')
    expect(within(dialog).getByLabelText(/^price/i)).toHaveValue(null)
    expect(within(dialog).queryByDisplayValue('Standard Membership')).not.toBeInTheDocument()
  })
})

describe('NEW-140: admin branch form (Admin › Tenant › Branches)', () => {
  it('editing the address sends the picked place id and point with the branch', async () => {
    const onSubmit = vi.fn()
    render(
      <BranchFormDialog
        open
        onOpenChange={vi.fn()}
        mode="edit"
        branch={{ id: 'b1', branchName: 'Uptown', address: 'Old road', cityId: 7, status: 'ACTIVE' } as never}
        onSubmit={onSubmit}
      />
    )
    const dialog = screen.getByRole('dialog')
    await pickPlace('Address', '12 MM', /12 MM Alam Road/, dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      address: MM_ALAM.formattedAddress, cityId: 7, areaId: 71, latitude: 31.5101, longitude: 74.3442, googlePlaceId: 'addr-mm-alam',
    }))
  })
})
