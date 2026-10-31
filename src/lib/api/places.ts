import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * Google Places through our API (Phase 7 P3, places.routes.js), the same calls the mobile app makes.
 * The browser never calls Google for a search: the API holds the server key, bills per session
 * token and upserts the picked city / area into our tables. The web key only draws the map.
 */
export type PlaceKind = 'city' | 'area' | 'address'

export interface PlaceSuggestion {
  placeId: string
  primaryText: string
  secondaryText: string | null
}

export interface PlaceRef {
  id: number
  name: string
}

/** A picked place: our city / area ids, the address and the point. */
export interface PlaceDetails {
  placeId: string | null
  formattedAddress: string | null
  latitude: number | null
  longitude: number | null
  city: PlaceRef | null
  area: PlaceRef | null
}

/** One id per search (Google bills autocomplete + details as one session). */
export const newPlacesSession = (): string => crypto.randomUUID()

export const placesApi = {
  autocomplete: async (q: { input: string; kind: PlaceKind; sessionToken: string; cityId?: number }): Promise<ApiResponse<{ suggestions: PlaceSuggestion[] }>> => {
    const { data } = await apiClient.get('/places/autocomplete', {
      params: { input: q.input, kind: q.kind, sessionToken: q.sessionToken, ...(q.cityId ? { cityId: q.cityId } : {}) },
    })
    return data
  },

  details: async (placeId: string, q: { kind: PlaceKind; sessionToken?: string; cityId?: number }): Promise<ApiResponse<PlaceDetails>> => {
    const { data } = await apiClient.get(`/places/details/${encodeURIComponent(placeId)}`, {
      params: { kind: q.kind, ...(q.sessionToken ? { sessionToken: q.sessionToken } : {}), ...(q.cityId ? { cityId: q.cityId } : {}) },
    })
    return data
  },

  reverseGeocode: async (latitude: number, longitude: number): Promise<ApiResponse<PlaceDetails>> => {
    const { data } = await apiClient.get('/places/reverse-geocode', { params: { lat: latitude, lng: longitude } })
    return data
  },

  /** An area typed by hand when Google has none (once per city). */
  createArea: async (cityId: number, name: string): Promise<ApiResponse<PlaceRef & { cityId: number }>> => {
    const { data } = await apiClient.post('/places/areas', { cityId, name })
    return data
  },
}
