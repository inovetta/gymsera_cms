import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * Host console API (Prompt 3B). The same /host/* endpoints the mobile app calls for its
 * organization strip, capacity banner, add / delete / restore branch and new organization
 * (gyms_era/lib/features/gym_host/data/repositories/gyms_repository.dart). Owner only: the
 * server answers 403 to anyone else.
 */

/** GET /host/branch-quota — tenant-wide capacity (one shared pool across every organization). */
export interface BranchQuota {
  maxBranches: number
  usedBranches: number
  remainingBranches: number
  activeBranches: number
  buildableBranches: number
  overQuotaCount: number
  overQuotaGraceDays?: number
  overQuotaGraceRemainingDays?: number | null
  isOverQuotaGraceExpired?: boolean
  /** Only with ?organizationId= */
  organizationBranches?: number
  organizationReservedSlots?: number
}

/** GET /host/organization-quota */
export interface OrganizationQuota {
  maxOrganizations: number
  usedOrganizations?: number
  remainingOrganizations?: number
  canCreateNext: boolean
  blockingListingStatus: string | null
  hasOrganizationLimit?: boolean
}

/** An "organization" in the host console: a gym listing inside the tenant. */
export interface HostListing {
  id: string
  title: string
  status: string
  reservedSlots?: number
}

export interface HostBranch {
  id: string
  branchName: string
  status: string
  address?: string
  phone?: string
  openingTime?: string
  closingTime?: string
  gymListingId?: string | null
  /** P5b (R-81): set while the host has paused the branch (hidden from travellers). */
  pausedAt?: string | null
  [key: string]: unknown
}

/** P5b item 7 (R-81): the GymsEra plan still renews at the store after an organization goes. */
export interface StorePlanNotice {
  platform: 'IOS' | 'ANDROID'
  manageUrl: string
  message: string
}

/** POST /host/branches — the body the mobile wizard sends (createBranch in gyms_repository.dart). */
export interface CreateHostBranchPayload {
  branchName: string
  gymListingId?: string
  address?: string
  cityId?: number
  areaId?: number
  latitude?: number
  longitude?: number
  /** NEW-140: the Google place the address was picked from (through /places). */
  googlePlaceId?: string
  phone?: string
  openingTime?: string
  closingTime?: string
  facilitiesJson?: string[]
  packages: Array<{ name: string; price: number; durationType?: string; durationValue?: number; description?: string }>
}

export interface CreateListingPayload {
  gymName: string
  gymDescription: string
  genderType: string
  branchSource: 'new' | 'reserve'
  packages?: Array<{ name: string; price: number; durationType?: string; durationValue?: number; description?: string }>
  cityId?: number
  areaId?: number
  address?: string
  latitude?: number
  longitude?: number
  /** NEW-140: the Google place the first branch's address was picked from. */
  googlePlaceId?: string
}

/** One subscription a check-in would accept, as the member lookup returns it (NEW-56). */
export interface LookupSubscription {
  id: string
  planName: string | null
  endDate: string
  remainingVisits: number | null
}

export interface BranchMemberLookup {
  exists: boolean
  user?: { id: string; fullName: string; email: string }
  subscriptions?: LookupSubscription[]
}

/**
 * One branch's storefront as GET /host/branches/:branchId/listing-content returns it
 * (gymsera_be gyms.controller.js getBranchListingContent → `{ branch }`). The JSON columns can
 * arrive as arrays or as JSON strings; read them with `asStringList` (lib/listing/content.ts).
 */
export interface BranchListingContent {
  id: string
  branchName: string
  status: string
  gymListingId?: string | null
  tagline?: string | null
  category?: string | null
  description?: string | null
  establishedYear?: number | null
  floorArea?: number | null
  tagsJson?: unknown
  facilitiesJson?: unknown
  imagesJson?: unknown
  openingTime?: string | null
  closingTime?: string | null
  address?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  postalCode?: string | null
  country?: string | null
  cityId?: number | null
  areaId?: number | null
  latitude?: number | string | null
  longitude?: number | string | null
  phone?: string | null
  travelerVisibilityStatus?: string | null
  deactivationReason?: string | null
}

/** The fields PATCH /host/branches/:branchId/listing-content accepts (gyms.controller.js:409). No `status`. */
export type UpdateListingContentPayload = Partial<{
  branchName: string
  tagline: string
  category: string
  description: string
  establishedYear: number
  floorArea: number
  tagsJson: string[]
  facilitiesJson: string[]
  imagesJson: string[]
  openingTime: string
  closingTime: string
  address: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  country: string
  cityId: number
  areaId: number
  phone: string
  latitude: number
  longitude: number
  googlePlaceId: string
}>

export const hostApi = {
  getBranchQuota: async (organizationId?: string): Promise<ApiResponse<BranchQuota>> => {
    const { data } = await apiClient.get('/host/branch-quota', {
      params: organizationId ? { organizationId } : {},
    })
    return data
  },

  getOrganizationQuota: async (): Promise<ApiResponse<OrganizationQuota>> => {
    const { data } = await apiClient.get('/host/organization-quota')
    return data
  },

  getListings: async (): Promise<ApiResponse<HostListing[]>> => {
    const { data } = await apiClient.get('/host/listings')
    return data
  },

  /** GET /host/listings/:id/branches — one organization's branches. */
  getListingBranches: async (
    listingId: string,
    includeInactive = false
  ): Promise<ApiResponse<{ branches: HostBranch[] }>> => {
    const { data } = await apiClient.get(`/host/listings/${listingId}/branches`, {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
    })
    return data
  },

  /**
   * POST /host/branches. Capacity is not checked first: the server answers 403
   * `branch_limit_reached` / `account_over_quota` when the plan has no room.
   */
  createBranch: async (payload: CreateHostBranchPayload): Promise<ApiResponse<{ branch: HostBranch }>> => {
    const { data } = await apiClient.post('/host/branches', payload)
    return data
  },

  /**
   * DELETE /host/branches/:id. Needs the owner's credentials again (re-auth: `password`, or a
   * social `provider` + `idToken`). The server answers 401 when they are wrong and 409
   * `last_branch_in_organization` when this is the organization's last branch; send again with
   * `confirmOrganizationDeletion: true` once the owner has confirmed. 409 `branch_delete_blocked`
   * (P5b, R-81) while members, bookings or payments are open; the host may pause instead.
   */
  deleteBranch: async (
    branchId: string,
    body: { password?: string; provider?: string; idToken?: string; confirmOrganizationDeletion?: boolean }
  ): Promise<ApiResponse<{ message?: string; organizationDeleted?: boolean; storePlanNotice?: StorePlanNotice | null } | null>> => {
    const { data } = await apiClient.delete(`/host/branches/${branchId}`, { data: body })
    return data
  },

  /** POST /host/branches/:id/restore — uses one unit of capacity again (403 when there is none). */
  restoreBranch: async (branchId: string): Promise<ApiResponse<{ branch?: HostBranch }>> => {
    const { data } = await apiClient.post(`/host/branches/${branchId}/restore`)
    return data
  },

  /** POST /host/branches/:id/pause (P5b, R-81): hidden from travellers, nothing else changes. */
  pauseBranch: async (branchId: string): Promise<ApiResponse<{ branch: HostBranch }>> => {
    const { data } = await apiClient.post(`/host/branches/${branchId}/pause`)
    return data
  },

  /** POST /host/branches/:id/resume: shown to travellers again as it was. */
  resumeBranch: async (branchId: string): Promise<ApiResponse<{ branch: HostBranch }>> => {
    const { data } = await apiClient.post(`/host/branches/${branchId}/resume`)
    return data
  },

  /** GET /host/branches — every branch of the owner, across organizations. */
  getAllBranches: async (): Promise<ApiResponse<{ branches: HostBranch[] }>> => {
    const { data } = await apiClient.get('/host/branches')
    return data
  },

  /**
   * POST /host/listings (mobile: createListing → POST /host/organizations, the same route).
   * `branchSource`: 'new' builds a first branch now (needs `packages`), 'reserve' earmarks a slot.
   * An organization with no branch is refused (422 organization_needs_branch, NEW-168).
   */
  createListing: async (body: CreateListingPayload): Promise<ApiResponse<HostListing>> => {
    const { data } = await apiClient.post('/host/listings', body)
    return data
  },

  /**
   * GET /host/branches/:branchId/members/lookup?email= (host.controller.js lookupBranchMember).
   * `exists` is true only when the person holds an ACTIVE, PENDING or FROZEN subscription at this branch.
   * NEW-56: `subscriptions` lists their ACTIVE subscriptions at this branch that a check-in would
   * accept. Older servers omit it.
   */
  lookupBranchMember: async (
    branchId: string,
    email: string
  ): Promise<ApiResponse<BranchMemberLookup>> => {
    const { data } = await apiClient.get(`/host/branches/${branchId}/members/lookup`, { params: { email } })
    return data
  },

  /** GET /host/branches/:branchId/listing-content — every storefront field of one branch. */
  getBranchListingContent: async (branchId: string): Promise<ApiResponse<{ branch: BranchListingContent }>> => {
    const { data } = await apiClient.get(`/host/branches/${branchId}/listing-content`)
    return data
  },

  /**
   * PATCH /host/branches/:branchId/listing-content, the call the mobile listing editor makes for
   * every section. The whole response is returned: a 202 means the change was sent for approval
   * and nothing was saved, so read it with `readApprovalOutcome`.
   */
  updateBranchListingContent: async (branchId: string, payload: UpdateListingContentPayload) => {
    return apiClient.patch(`/host/branches/${branchId}/listing-content`, payload)
  },

  /** PATCH /host/branches/:branchId/resubmit-visibility — ask for review again after a deactivation. */
  resubmitBranchReview: async (branchId: string): Promise<ApiResponse<{ branch: BranchListingContent }>> => {
    const { data } = await apiClient.patch(`/host/branches/${branchId}/resubmit-visibility`)
    return data
  },
}
