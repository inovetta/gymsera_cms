import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchLocationFields, BranchLocationValue, areaPayload } from '@/components/features/places/branch-location-fields'
import { placesApi } from '@/lib/api/places'
import { areaRequestsApi } from '@/lib/api/area-requests'
import { ok } from '../fixtures/team'

/**
 * NEW-265 Part A (A7, R-108, R-109): the CMS branch location area copies the mobile picker. A host whose
 * area is not in the list keeps what they typed: POST /places/area-requests/check, "Did you mean …?",
 * then POST /places/area-requests; the area shows "(under review)" until an admin decides. A Google road
 * or landmark pick (autocomplete extended=true) is a pending request too. Admin forms pick real areas only
 * (R-109 F7) and keep the NEW-259 "Contact support" note.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

const PESHAWAR: BranchLocationValue = { cityId: 7, cityName: 'Peshawar', address: '' }
let autocomplete: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  autocomplete = vi.spyOn(placesApi, 'autocomplete').mockResolvedValue(ok({ suggestions: [] }) as never)
})
afterEach(() => vi.restoreAllMocks())

const typeArea = (text: string) => {
  const area = screen.getByLabelText('Area')
  fireEvent.focus(area)
  fireEvent.change(area, { target: { value: text } })
}

describe('NEW-265: host forms keep a typed area as a pending request', () => {
  it('no match → "Keep what you typed" → check → create (confirmNotListed) → the form holds the request', async () => {
    const check = vi.spyOn(areaRequestsApi, 'check').mockResolvedValue(ok({ name: 'Shinwari Town', match: null, similar: [], canRequest: true, reason: null }) as never)
    const create = vi.spyOn(areaRequestsApi, 'create').mockResolvedValue(ok({ areaRequest: { id: 5, cityId: 7, name: 'Shinwari Town', status: 'pending_review', source: 'typed' } }) as never)
    const onChange = vi.fn()
    wrap(<BranchLocationFields value={PESHAWAR} onChange={onChange} allowAreaRequests />)

    typeArea('Shinwari Town')
    fireEvent.click(await screen.findByRole('button', { name: /not in the list\? keep “shinwari town”/i }))

    await waitFor(() => expect(create).toHaveBeenCalledWith(7, 'Shinwari Town', true))
    expect(check).toHaveBeenCalledWith(7, 'Shinwari Town')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      areaId: undefined, areaRequestId: 5, areaName: 'Shinwari Town', areaStatus: 'pending_review',
    }))
    expect(autocomplete.mock.calls[0][0]).toMatchObject({ kind: 'area', cityId: 7, extended: true })
  })

  it('"Did you mean …?": picking a listed area uses it; "No, keep it" makes the request', async () => {
    vi.spyOn(areaRequestsApi, 'check').mockResolvedValue(ok({
      name: 'Universty Town', match: null, canRequest: true, reason: null,
      similar: [{ name: 'University Town', areaId: 12, status: 'approved' }, { name: 'Universe Town', areaId: null, status: 'pending_review' }],
    }) as never)
    const create = vi.spyOn(areaRequestsApi, 'create').mockResolvedValue(ok({ areaRequest: { id: 6, cityId: 7, name: 'Universty Town', status: 'pending_review', source: 'typed' } }) as never)
    const onChange = vi.fn()
    wrap(<BranchLocationFields value={PESHAWAR} onChange={onChange} allowAreaRequests />)

    typeArea('Universty Town')
    fireEvent.click(await screen.findByRole('button', { name: /keep “universty town”/i }))
    expect(await screen.findByText(/did you mean/i)).toBeInTheDocument()
    expect(screen.getByText(/universe town/i)).toHaveTextContent(/under review/i)

    fireEvent.click(screen.getByRole('button', { name: 'University Town' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ areaId: 12, areaName: 'University Town', areaRequestId: undefined }))
    expect(create).not.toHaveBeenCalled()

    typeArea('Universty Town')
    fireEvent.click(await screen.findByRole('button', { name: /keep “universty town”/i }))
    fireEvent.click(await screen.findByRole('button', { name: /no, keep “universty town”/i }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(7, 'Universty Town', true))
  })

  it('a typed name that is already an area (or an alias) just uses the area', async () => {
    vi.spyOn(areaRequestsApi, 'check').mockResolvedValue(ok({ name: 'hayatabad', match: { areaId: 3, name: 'Hayatabad' }, similar: [], canRequest: true, reason: null }) as never)
    const create = vi.spyOn(areaRequestsApi, 'create')
    const onChange = vi.fn()
    wrap(<BranchLocationFields value={PESHAWAR} onChange={onChange} allowAreaRequests />)
    typeArea('hayatabad')
    fireEvent.click(await screen.findByRole('button', { name: /keep “hayatabad”/i }))
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ areaId: 3, areaName: 'Hayatabad', areaRequestId: undefined })))
    expect(create).not.toHaveBeenCalled()
  })

  it('over the limit: the reason is shown and nothing is created', async () => {
    vi.spyOn(areaRequestsApi, 'check').mockResolvedValue(ok({ name: 'Delta Ville', match: null, similar: [], canRequest: false, reason: 'area_requests_city_limit' }) as never)
    const create = vi.spyOn(areaRequestsApi, 'create')
    wrap(<BranchLocationFields value={PESHAWAR} onChange={vi.fn()} allowAreaRequests />)
    typeArea('Delta Ville')
    fireEvent.click(await screen.findByRole('button', { name: /keep “delta ville”/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/3 areas waiting for review in this city/i)
    expect(create).not.toHaveBeenCalled()
  })

  it('a Google road pick is a pending request (no area)', async () => {
    autocomplete.mockResolvedValue(ok({ suggestions: [{ placeId: 'pl-road', primaryText: 'Warsak Road', secondaryText: 'Peshawar', source: 'google', type: 'road' }] }) as never)
    vi.spyOn(placesApi, 'details').mockResolvedValue(ok({
      placeId: 'pl-road', formattedAddress: 'Warsak Road, Peshawar', latitude: 34, longitude: 71.5,
      city: { id: 7, name: 'Peshawar' }, area: null,
      areaRequest: { id: 9, cityId: 7, name: 'Warsak Road', status: 'pending_review', source: 'google_road' },
    }) as never)
    const onChange = vi.fn()
    wrap(<BranchLocationFields value={PESHAWAR} onChange={onChange} allowAreaRequests />)
    typeArea('Warsak')
    const option = await screen.findByRole('button', { name: /warsak road/i })
    expect(option).toHaveTextContent(/road/i)
    fireEvent.click(option)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ areaId: undefined, areaRequestId: 9, areaName: 'Warsak Road', areaStatus: 'pending_review' })))
  })

  it('a held request reads "(under review)"; a refused one says so and asks to pick again', () => {
    const { rerender } = wrap(<BranchLocationFields value={{ ...PESHAWAR, areaRequestId: 5, areaName: 'Shinwari Town', areaStatus: 'pending_review' }} onChange={vi.fn()} allowAreaRequests />)
    expect(screen.getByTestId('area-status')).toHaveTextContent('Shinwari Town (under review)')
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <BranchLocationFields value={{ ...PESHAWAR, areaRequestId: 5, areaName: 'Shinwari Town', areaStatus: 'rejected', areaRejectReason: 'Not in Peshawar' }} onChange={vi.fn()} allowAreaRequests />
      </QueryClientProvider>
    )
    expect(screen.getByTestId('area-status')).toHaveTextContent(/shinwari town was not accepted: not in peshawar\. please pick your area again\./i)
  })

  it('areaPayload sends the request or the area, never both', () => {
    expect(areaPayload({ ...PESHAWAR, areaRequestId: 5, areaId: undefined })).toEqual({ areaRequestId: 5 })
    expect(areaPayload({ ...PESHAWAR, areaId: 3 })).toEqual({ areaId: 3 })
    expect(areaPayload(PESHAWAR)).toEqual({})
    // A refused request is never sent back (the server answers 422 area_request_rejected).
    expect(areaPayload({ ...PESHAWAR, areaRequestId: 5, areaStatus: 'rejected' })).toEqual({})
  })
})

describe('NEW-265 (R-109 F7): admin forms pick real areas only', () => {
  it('no "Keep what you typed", the NEW-259 note instead, and no roads or landmarks asked for', async () => {
    const check = vi.spyOn(areaRequestsApi, 'check')
    wrap(<BranchLocationFields value={PESHAWAR} onChange={vi.fn()} />)
    typeArea('Shinwari Town')
    expect(await screen.findByTestId('area-not-found')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /keep/i })).toBeNull()
    expect(autocomplete.mock.calls[0][0].extended).toBeFalsy()
    expect(check).not.toHaveBeenCalled()
  })
})
