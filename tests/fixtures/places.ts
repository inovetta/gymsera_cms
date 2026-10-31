import { expect, vi } from 'vitest'
import { fireEvent, waitFor, within } from '@testing-library/react'
import { placesApi, PlaceDetails, PlaceKind } from '@/lib/api/places'
import { ok } from './team'

/**
 * A fake of our /places API (Phase 7 P3 shapes, gymsera_be places.service.js). Nothing reaches Google:
 * the API holds the server key, and these tests stand in for the API.
 */
export const LAHORE: PlaceDetails = {
  placeId: 'city-lahore', formattedAddress: 'Lahore, Pakistan', latitude: 31.5204, longitude: 74.3587,
  city: { id: 7, name: 'Lahore' }, area: null,
}
export const GULBERG: PlaceDetails = {
  placeId: 'area-gulberg', formattedAddress: 'Gulberg, Lahore', latitude: 31.52, longitude: 74.35,
  city: { id: 7, name: 'Lahore' }, area: { id: 70, name: 'Gulberg' },
}
export const MM_ALAM: PlaceDetails = {
  placeId: 'addr-mm-alam', formattedAddress: '12 MM Alam Road, Gulberg III, Lahore', latitude: 31.5101, longitude: 74.3442,
  city: { id: 7, name: 'Lahore' }, area: { id: 71, name: 'Gulberg III' },
}

const SUGGESTIONS: Record<PlaceKind, { placeId: string; primaryText: string; secondaryText: string }[]> = {
  city: [{ placeId: 'city-lahore', primaryText: 'Lahore', secondaryText: 'Punjab, Pakistan' }],
  area: [{ placeId: 'area-gulberg', primaryText: 'Gulberg', secondaryText: 'Lahore' }],
  address: [{ placeId: 'addr-mm-alam', primaryText: '12 MM Alam Road', secondaryText: 'Gulberg III, Lahore' }],
}
const DETAILS: Record<string, PlaceDetails> = { 'city-lahore': LAHORE, 'area-gulberg': GULBERG, 'addr-mm-alam': MM_ALAM }

export const fakePlaces = () => ({
  autocomplete: vi.spyOn(placesApi, 'autocomplete').mockImplementation((async (q: { kind: PlaceKind; input: string }) =>
    ok({ suggestions: q.input.toLowerCase().startsWith('zz') ? [] : SUGGESTIONS[q.kind] })) as never),
  details: vi.spyOn(placesApi, 'details').mockImplementation((async (placeId: string) => ok(DETAILS[placeId])) as never),
  reverseGeocode: vi.spyOn(placesApi, 'reverseGeocode').mockResolvedValue(ok(MM_ALAM) as never),
  createArea: vi.spyOn(placesApi, 'createArea').mockImplementation((async (cityId: number, name: string) =>
    ok({ id: 99, cityId, name })) as never),
})

/** Type into a Places field (label "City" / "Area" / "Address") and pick the first suggestion. */
export const pickPlace = async (label: string, typed: string, option: RegExp, root: HTMLElement = document.body) => {
  const input = within(root).getByLabelText(label)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: typed } })
  fireEvent.click(await within(root).findByRole('button', { name: option }))
  await waitFor(() => expect((input as HTMLInputElement).value).not.toBe(typed))
}
