import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CitiesPage from '@/app/(dashboard)/admin/cities/page'
import { citiesApi } from '@/lib/api/cities'
import { areaRequestsApi, AreaRequestGroup } from '@/lib/api/area-requests'
import { ok } from '../fixtures/team'

/**
 * NEW-265 Part A (A6, A7, R-108, R-110): CMS › Cities & Areas › "Unmatched areas". Platform admins see the
 * typed areas and Google roads / landmarks waiting for review, grouped by city and spelling, with the
 * gyms waiting on them, and approve (new area; the pin is optional, R-110), merge into an existing area,
 * reject with a reason, or retry a write that failed. Each area lists its other spellings (aliases).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({
  MapPicker: ({ onChange }: { onChange: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onChange(34.02, 71.6)}>Drop pin</button>
  ),
}))

const GROUP: AreaRequestGroup = {
  requestIds: [11, 12],
  cityId: 7,
  cityName: 'Peshawar',
  name: 'Shinwari Town',
  source: 'typed',
  googlePlaceId: null,
  businessCount: 2,
  businesses: [
    { organizationId: 't1', businessId: null, branchId: null, name: 'Iron Gym', latitude: 34.01, longitude: 71.51 },
    { organizationId: 't2', businessId: null, branchId: 'b2', name: 'Fit Hub', latitude: null, longitude: null },
  ],
  requestedBy: [{ userId: 'u1', name: 'Hira Khan' }, { userId: 'u2', name: 'Ali Raza' }],
  firstRequestedAt: '2026-11-16T10:00:00.000Z',
  similar: [{ name: 'Shinwari Colony', areaId: 30, status: 'approved' }],
}

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

let list: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([{ id: 7, name: 'Peshawar', isActive: true, createdAt: '2026-01-01', areaCount: 2 }]) as never)
  vi.spyOn(citiesApi, 'getAreas').mockResolvedValue(ok({ areas: [{ id: 30, cityId: 7, name: 'Shinwari Colony' }, { id: 31, cityId: 7, name: 'Hayatabad' }] }) as never)
  list = vi.spyOn(areaRequestsApi, 'list').mockResolvedValue(ok({ groups: [GROUP], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }) as never)
})
afterEach(() => vi.restoreAllMocks())

const openTab = async () => {
  wrap(<CitiesPage />)
  fireEvent.mouseDown(await screen.findByRole('tab', { name: /unmatched areas/i }))
  fireEvent.click(screen.getByRole('tab', { name: /unmatched areas/i }))
  return screen.findByTestId('area-request-group-11')
}

describe('NEW-265: Unmatched areas queue', () => {
  it('lists each group with its city, gyms, requesters and similar areas (pending by default)', async () => {
    const card = await openTab()
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending_review' }))
    expect(within(card).getByText('Shinwari Town')).toBeInTheDocument()
    expect(within(card).getByText(/peshawar/i)).toBeInTheDocument()
    expect(within(card).getByText(/2 businesses/i)).toBeInTheDocument()
    expect(within(card).getByText(/hira khan, ali raza/i)).toBeInTheDocument()
    expect(within(card).getByText('Iron Gym')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /iron gym on the map/i })).toHaveAttribute('href', expect.stringContaining('34.01,71.51'))
    expect(within(card).getByText(/shinwari colony/i)).toBeInTheDocument()
  })

  it('approve without a pin (R-110): name and group only', async () => {
    const approve = vi.spyOn(areaRequestsApi, 'approve').mockResolvedValue(ok({ area: { id: 40, name: 'Shinwari Town' }, decided: 2, propagated: 3, failed: [] }) as never)
    const card = await openTab()
    fireEvent.click(within(card).getByRole('button', { name: /^approve$/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/area name/i)).toHaveValue('Shinwari Town')
    fireEvent.click(within(dialog).getByRole('button', { name: /^approve area$/i }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith(11, { name: 'Shinwari Town', applyToGroup: true }))
  })

  it('approve with a pin sends the coordinates; one request only when "every request" is unticked', async () => {
    const approve = vi.spyOn(areaRequestsApi, 'approve').mockResolvedValue(ok({ area: { id: 40, name: 'Shinwari' }, decided: 1, propagated: 1, failed: [{ organizationId: 't2', error: 'branch_not_found' }] }) as never)
    const card = await openTab()
    fireEvent.click(within(card).getByRole('button', { name: /^approve$/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/area name/i), { target: { value: 'Shinwari' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /drop pin/i }))
    fireEvent.click(within(dialog).getByLabelText(/every request with this spelling/i))
    fireEvent.click(within(dialog).getByRole('button', { name: /^approve area$/i }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith(11, { name: 'Shinwari', latitude: 34.02, longitude: 71.6, applyToGroup: false }))
    expect(await screen.findByText(/1 business could not be updated/i)).toBeInTheDocument()
  })

  it('merge into an existing area of the city', async () => {
    const merge = vi.spyOn(areaRequestsApi, 'merge').mockResolvedValue(ok({ area: { id: 30, name: 'Shinwari Colony' }, decided: 2, propagated: 3, failed: [] }) as never)
    const card = await openTab()
    fireEvent.click(within(card).getByRole('button', { name: /^merge$/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText(/existing area/i), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^merge area$/i }))
    await waitFor(() => expect(merge).toHaveBeenCalledWith(11, { areaId: 30, applyToGroup: true }))
  })

  it('reject needs a reason of 3 characters or more', async () => {
    const reject = vi.spyOn(areaRequestsApi, 'reject').mockResolvedValue(ok({ decided: 2 }) as never)
    const card = await openTab()
    fireEvent.click(within(card).getByRole('button', { name: /^reject$/i }))
    const dialog = await screen.findByRole('dialog')
    const button = within(dialog).getByRole('button', { name: /^reject area$/i })
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'no' } })
    expect(button).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText(/reason/i), { target: { value: 'Not an area of Peshawar' } })
    fireEvent.click(button)
    await waitFor(() => expect(reject).toHaveBeenCalledWith(11, { reason: 'Not an area of Peshawar', applyToGroup: true }))
  })

  it('decided groups (status filter) offer Retry for writes that failed', async () => {
    const retry = vi.spyOn(areaRequestsApi, 'retry').mockResolvedValue(ok({ propagated: 1, failed: [] }) as never)
    await openTab()
    fireEvent.change(screen.getByLabelText(/^status$/i), { target: { value: 'approved' } })
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'approved' })))
    const card = await screen.findByTestId('area-request-group-11')
    expect(within(card).queryByRole('button', { name: /^approve$/i })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(retry).toHaveBeenCalledWith(11))
  })
})

describe('NEW-265: other spellings of an area (aliases)', () => {
  it('lists the aliases of an area and deletes one', async () => {
    vi.spyOn(areaRequestsApi, 'aliases').mockResolvedValue(ok({ area: { id: 30, cityId: 7, name: 'Shinwari Colony' }, aliases: [{ id: 5, aliasKey: 'shinwaritown', createdAt: '2026-11-16' }] }) as never)
    const del = vi.spyOn(areaRequestsApi, 'deleteAlias').mockResolvedValue(ok({ deleted: true }) as never)
    wrap(<CitiesPage />)
    fireEvent.click(await screen.findByText('Peshawar'))
    fireEvent.click(await screen.findByRole('button', { name: /other spellings of shinwari colony/i }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('shinwaritown')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /delete shinwaritown/i }))
    await waitFor(() => expect(del).toHaveBeenCalledWith(5))
  })
})
