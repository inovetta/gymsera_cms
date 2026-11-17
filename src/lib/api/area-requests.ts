import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * NEW-265 Part A (R-108, R-109, R-110): typed areas and Google roads / landmarks are pending area
 * requests until a platform admin approves, merges or rejects them (spec §13 "NEW-265 Part A", A3, A6).
 */
export type AreaRequestStatus = 'pending_review' | 'approved' | 'merged' | 'rejected'
export type AreaRequestSource = 'typed' | 'google_road' | 'google_landmark'

export interface AreaRequestRef {
  id: number
  cityId: number
  name: string
  status: AreaRequestStatus
  source?: AreaRequestSource
}

/** What a gym's read says while its area waits for review or was refused. */
export interface PendingArea {
  requestId: number
  name: string
  status: 'pending_review' | 'rejected'
  rejectReason: string | null
}

export interface SimilarArea {
  name: string
  areaId: number | null
  status: 'approved' | 'pending_review'
}

export interface AreaCheck {
  name: string
  match: { areaId: number; name: string } | null
  similar: SimilarArea[]
  canRequest: boolean
  reason: null | 'area_requests_daily_limit' | 'area_requests_city_limit'
}

/** POST /places/area-requests answers an existing area, or a request (new or the person's own). */
export type AreaRequestAnswer = { area: { id: number; name: string } } | { areaRequest: AreaRequestRef }

export interface AreaRequestGym {
  tenantId: string
  listingId: string | null
  branchId: string | null
  title: string | null
  latitude: number | null
  longitude: number | null
}

export interface AreaRequestGroup {
  requestIds: number[]
  cityId: number
  cityName: string | null
  name: string
  source: AreaRequestSource
  googlePlaceId: string | null
  gymCount: number
  gyms: AreaRequestGym[]
  requestedBy: { userId: string; name: string | null }[]
  firstRequestedAt: string
  similar: SimilarArea[]
}

export interface AreaDecision {
  area?: { id: number; name: string } | null
  decided: number
  propagated?: number
  failed?: { tenantId: string; error: string }[]
}

export interface AreaAlias {
  id: number
  aliasKey: string
  createdAt: string
}

export const LIMIT_MESSAGES: Record<string, string> = {
  area_requests_daily_limit: 'You have asked for 5 new areas today. Please try again tomorrow, or pick an area from the list.',
  area_requests_city_limit: 'You have 3 areas waiting for review in this city. Please wait for them, or pick an area from the list.',
}

export const areaRequestsApi = {
  check: async (cityId: number, name: string): Promise<ApiResponse<AreaCheck>> => {
    const { data } = await apiClient.post('/places/area-requests/check', { cityId, name })
    return data
  },

  create: async (cityId: number, name: string, confirmNotListed = false): Promise<ApiResponse<AreaRequestAnswer>> => {
    const { data } = await apiClient.post('/places/area-requests', { cityId, name, ...(confirmNotListed ? { confirmNotListed: true } : {}) })
    return data
  },

  get: async (id: number): Promise<ApiResponse<{ areaRequest: AreaRequestRef & { area: { id: number; name: string } | null; rejectReason: string | null } }>> => {
    const { data } = await apiClient.get(`/places/area-requests/${id}`)
    return data
  },

  // ── Platform admins (CMS › Cities & Areas › Unmatched areas) ──
  list: async (params: { status?: AreaRequestStatus; cityId?: number; page?: number; limit?: number }): Promise<ApiResponse<{ groups: AreaRequestGroup[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>> => {
    const { data } = await apiClient.get('/admin/area-requests', { params })
    return data
  },

  /** R-110: the pin is optional; send both coordinates or neither. */
  approve: async (id: number, body: { name: string; latitude?: number; longitude?: number; applyToGroup: boolean }): Promise<ApiResponse<AreaDecision>> => {
    const { data } = await apiClient.post(`/admin/area-requests/${id}/approve`, body)
    return data
  },

  merge: async (id: number, body: { areaId: number; applyToGroup: boolean }): Promise<ApiResponse<AreaDecision>> => {
    const { data } = await apiClient.post(`/admin/area-requests/${id}/merge`, body)
    return data
  },

  reject: async (id: number, body: { reason: string; applyToGroup: boolean }): Promise<ApiResponse<AreaDecision>> => {
    const { data } = await apiClient.post(`/admin/area-requests/${id}/reject`, body)
    return data
  },

  retry: async (id: number): Promise<ApiResponse<{ propagated: number; failed: { tenantId: string; error: string }[] }>> => {
    const { data } = await apiClient.post(`/admin/area-requests/${id}/retry`)
    return data
  },

  aliases: async (areaId: number): Promise<ApiResponse<{ area: { id: number; cityId: number; name: string }; aliases: AreaAlias[] }>> => {
    const { data } = await apiClient.get(`/admin/areas/${areaId}/aliases`)
    return data
  },

  deleteAlias: async (id: number): Promise<ApiResponse<{ deleted: boolean }>> => {
    const { data } = await apiClient.delete(`/admin/area-aliases/${id}`)
    return data
  },
}
