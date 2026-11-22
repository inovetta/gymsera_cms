import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * Host console API (Prompt 3B), in the names of API contract v2 (R-120,
 * gymsera_be docs/API_CONTRACT_V2.md): Organization › Business › Branch, one `businessId`.
 * Owner only: the server answers 403 to anyone else.
 */

/** The organization-wide pool (contract v2 §3 BranchQuota `pool`, enterprise D7). */
export interface CapacityPool {
  max: number
  used: number
  reserved: number
  free: number
}

/** GET /host/branch-quota[?businessId=]: one capacity pool across every business of the organization. */
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
  /** Organization-wide pool (new in contract v2). */
  pool?: CapacityPool
  /** Only with ?businessId= */
  businessBranches?: number
  businessReservedSlots?: number
}

/** Business approval state (contract v2 §5: business `kycStatus`). */
export type BusinessKycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED'
/** What a business still needs before an admin can approve it (contract v2 §5, enterprise D10). */
export type MissingForApproval = 'PROOF_OF_PREMISES' | 'PHOTOS_MIN_3'
/** Business document types (contract v2 §5, enterprise D10). */
export type BusinessDocumentType = 'PROOF_OF_PREMISES' | 'BUSINESS_REGISTRATION'

/** One uploaded business document (same shape as the organization's documents, R-85). */
export interface BusinessDocument {
  documentId: string
  originalName: string
  mimetype: string
  size: number
  documentType?: BusinessDocumentType | string
  uploadedAt: string
  streamUrl: string
}

/**
 * Contract v2 §3 "Business": one business of the organization (GET /host/businesses and
 * /host/businesses/:businessId). `id` is the one business id (option S).
 */
export interface Business {
  id: string
  organizationId?: string
  primaryBranchId?: string | null
  cityId?: number | null
  areaId?: number | null
  name: string
  description?: string | null
  logoUrl?: string | null
  coverImageUrl?: string | null
  genderType?: string | null
  contactPhone?: string | null
  website?: string | null
  facilitiesJson?: unknown
  imagesJson?: string[] | null
  category?: string | null
  establishedYear?: number | null
  status: string
  reservedSlots?: number
  rejectionReason?: string | null
  createdAt?: string
  kycStatus?: BusinessKycStatus
  kycDocuments?: BusinessDocument[]
  kycSubmittedAt?: string | null
  approvedAt?: string | null
  verifiedAt?: string | null
  /** D11: registration checked by GymsEra. Never affects visibility. */
  businessVerified?: boolean
  /** Only an approved (ACTIVE) business may receive branches (D7). */
  canReceiveBranches?: boolean
  travellerVisible?: boolean
  branchCount?: number
  /** Add Business holds the first branch until approval (Q2). */
  heldFirstBranch?: boolean
  missingForApproval?: MissingForApproval[]
  firstBranchDraft?: Record<string, unknown> | null
}

/** GET /host/business-quota (was organization-quota; G5, owner decision 2026-11-22). */
export interface BusinessQuota {
  pool: CapacityPool
  /** False while another business blocks a new one (see blockingBusinessStatus) or the pool is full. */
  canAddBusiness: boolean
  blockingBusinessStatus: string | null
}

/** PATCH /host/businesses/:businessId. Empty text clears a field; establishedYear null clears it. */
export interface UpdateBusinessPayload {
  businessName?: string
  businessDescription?: string
  category?: string | null
  establishedYear?: number | null
  contactPhone?: string
  contactEmail?: string
  website?: string
  genderType?: string
  logoUrl?: string
  coverImageUrl?: string
  imagesJson?: string[]
}

export interface HostBranch {
  id: string
  branchName: string
  status: string
  address?: string
  phone?: string
  openingTime?: string
  closingTime?: string
  businessId?: string | null
  /** P5b (R-81): set while the host has paused the branch (hidden from travellers). */
  pausedAt?: string | null
  [key: string]: unknown
}

/** P5b item 7 (R-81): the GymsEra plan still renews at the store after a business goes. */
export interface StorePlanNotice {
  platform: 'IOS' | 'ANDROID'
  manageUrl: string
  message: string
}

/** POST /host/branches — the body the mobile wizard sends (createBranch in gyms_repository.dart). */
export interface CreateHostBranchPayload {
  /** NEW-265: a pending area request instead of areaId (never both). */
  areaRequestId?: number
  branchName: string
  /** The business the branch is added to; it must be approved (409 business_not_approved). */
  businessId: string
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
  /** Photo URLs (enterprise D8: at least 3, from POST /host/businesses/staging-images). */
  imagesJson?: string[]
  packages: Array<{ name: string; price: number; durationType?: string; durationValue?: number; description?: string }>
}

/**
 * POST /host/businesses (Add Business, contract v2 §3). The first branch is held until the
 * business is approved; the answer is `{ business, branch: null, heldFirstBranch: true }`.
 */
export interface CreateBusinessPayload {
  /** NEW-265: a pending area request instead of areaId (one of the two is required). */
  areaRequestId?: number
  businessName: string
  businessDescription: string
  genderType: string
  contactPhone?: string
  logoUrl?: string
  coverImageUrl?: string
  images?: string[]
  facilitiesJson?: string[]
  openingTime?: string
  closingTime?: string
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
 * One branch's storefront as GET /host/branches/:branchId/public-content returns it (`{ branch }`).
 * The JSON columns can arrive as arrays or as JSON strings; read them with `asStringList`
 * (lib/listing/content.ts).
 */
export interface BranchPublicContent {
  /** NEW-265: the branch's own area request while pending or refused. */
  pendingArea?: import('./area-requests').PendingArea | null
  id: string
  branchName: string
  status: string
  businessId?: string | null
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

/** The fields PATCH /host/branches/:branchId/public-content accepts (contract v2 row 273). No `status`. */
export type UpdatePublicContentPayload = Partial<{
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
  /** NEW-265: a pending area request instead of areaId. */
  areaRequestId: number
  phone: string
  latitude: number
  longitude: number
  googlePlaceId: string
}>

export const hostApi = {
  getBranchQuota: async (businessId?: string): Promise<ApiResponse<BranchQuota>> => {
    const { data } = await apiClient.get('/host/branch-quota', {
      params: businessId ? { businessId } : {},
    })
    return data
  },

  getBusinessQuota: async (): Promise<ApiResponse<BusinessQuota>> => {
    const { data } = await apiClient.get('/host/business-quota')
    return data
  },

  /** GET /host/businesses: every non-deleted business of the organization. */
  getBusinesses: async (): Promise<ApiResponse<Business[]>> => {
    const { data } = await apiClient.get('/host/businesses')
    return data
  },

  /** GET /host/businesses/:businessId: one business. */
  getBusiness: async (businessId: string): Promise<ApiResponse<Business>> => {
    const { data } = await apiClient.get(`/host/businesses/${businessId}`)
    return data
  },

  /** PATCH /host/businesses/:businessId: this business only (the owner, or listing.manage org-wide: R-89). */
  updateBusiness: async (businessId: string, payload: UpdateBusinessPayload): Promise<ApiResponse<Business>> => {
    const { data } = await apiClient.patch(`/host/businesses/${businessId}`, payload)
    return data
  },

  /**
   * POST /host/businesses/staging-images: stores the photos and answers their URLs, writing to no
   * business; the URLs are saved with updateBusiness or sent with a new branch.
   */
  uploadStagingImages: async (files: File[]): Promise<string[]> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post('/host/businesses/staging-images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const urls = (data?.data?.urls ?? []) as unknown[]
    return urls.map(String)
  },

  /** GET /host/businesses/:businessId/branches: one business's branches. */
  getBusinessBranches: async (
    businessId: string,
    includeInactive = false
  ): Promise<ApiResponse<{ branches: HostBranch[] }>> => {
    const { data } = await apiClient.get(`/host/businesses/${businessId}/branches`, {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
    })
    return data
  },

  /** GET /host/businesses/:businessId/kyc-documents: the business's documents (enterprise D10). */
  getBusinessDocuments: async (businessId: string): Promise<ApiResponse<BusinessDocument[]>> => {
    const { data } = await apiClient.get(`/host/businesses/${businessId}/kyc-documents`)
    return data
  },

  /** POST /host/businesses/:businessId/kyc-documents: body `documentType`, files `documents`. */
  uploadBusinessDocuments: async (
    businessId: string,
    documentType: BusinessDocumentType,
    files: File[]
  ): Promise<ApiResponse<BusinessDocument[]>> => {
    const formData = new FormData()
    formData.append('documentType', documentType)
    files.forEach((f) => formData.append('documents', f))
    const { data } = await apiClient.post(`/host/businesses/${businessId}/kyc-documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /**
   * POST /host/branches. Capacity is not checked first: the server answers 403
   * `branch_limit_reached` / `account_over_quota` when the plan has no room, and 409
   * `business_not_approved` when the business is still under review.
   */
  createBranch: async (payload: CreateHostBranchPayload): Promise<ApiResponse<{ branch: HostBranch }>> => {
    const { data } = await apiClient.post('/host/branches', payload)
    return data
  },

  /**
   * DELETE /host/branches/:branchId. Needs the owner's credentials again (re-auth: `password`, or a
   * social `provider` + `idToken`). The server answers 401 when they are wrong and 409
   * `last_branch_in_business` when this is the business's last branch; send again with
   * `confirmBusinessDeletion: true` once the owner has confirmed. 409 `branch_delete_blocked`
   * (P5b, R-81) while members, bookings or payments are open; the host may pause instead.
   */
  deleteBranch: async (
    branchId: string,
    body: { password?: string; provider?: string; idToken?: string; confirmBusinessDeletion?: boolean }
  ): Promise<ApiResponse<{
    message?: string
    /** The business went with its last branch (G6). */
    businessDeleted?: boolean
    storePlanNotice?: StorePlanNotice | null
  } | null>> => {
    const { data } = await apiClient.delete(`/host/branches/${branchId}`, { data: body })
    return data
  },

  /** POST /host/branches/:branchId/restore: uses one unit of capacity again (403 when there is none). */
  restoreBranch: async (branchId: string): Promise<ApiResponse<{ branch?: HostBranch }>> => {
    const { data } = await apiClient.post(`/host/branches/${branchId}/restore`)
    return data
  },

  /** POST /host/branches/:branchId/pause (P5b, R-81): hidden from travellers, nothing else changes. */
  pauseBranch: async (branchId: string): Promise<ApiResponse<{ branch: HostBranch }>> => {
    const { data } = await apiClient.post(`/host/branches/${branchId}/pause`)
    return data
  },

  /** POST /host/branches/:branchId/resume: shown to travellers again as it was. */
  resumeBranch: async (branchId: string): Promise<ApiResponse<{ branch: HostBranch }>> => {
    const { data } = await apiClient.post(`/host/branches/${branchId}/resume`)
    return data
  },

  /** GET /host/branches: every branch of the owner, across businesses. */
  getAllBranches: async (): Promise<ApiResponse<{ branches: HostBranch[] }>> => {
    const { data } = await apiClient.get('/host/branches')
    return data
  },

  /**
   * POST /host/businesses (Add Business). Reserves one unit of the pool and holds the first
   * branch until an admin approves the business; 403 `branch_limit_reached` when no unit is free.
   */
  createBusiness: async (
    body: CreateBusinessPayload
  ): Promise<ApiResponse<{ business: Business; branch: null; heldFirstBranch: boolean }>> => {
    const { data } = await apiClient.post('/host/businesses', body)
    return data
  },

  /**
   * GET /host/branches/:branchId/members/lookup?email=.
   * `exists` is true only when the person holds an ACTIVE, PENDING or FROZEN subscription at this branch.
   * NEW-56: `subscriptions` lists their ACTIVE subscriptions at this branch that a check-in would accept.
   */
  lookupBranchMember: async (
    branchId: string,
    email: string
  ): Promise<ApiResponse<BranchMemberLookup>> => {
    const { data } = await apiClient.get(`/host/branches/${branchId}/members/lookup`, { params: { email } })
    return data
  },

  /** GET /host/branches/:branchId/public-content: every storefront field of one branch. */
  getBranchPublicContent: async (branchId: string): Promise<ApiResponse<{ branch: BranchPublicContent }>> => {
    const { data } = await apiClient.get(`/host/branches/${branchId}/public-content`)
    return data
  },

  /**
   * PATCH /host/branches/:branchId/public-content, the call the mobile listing editor makes for
   * every section. The whole response is returned: a 202 means the change was sent for approval
   * and nothing was saved, so read it with `readApprovalOutcome`.
   */
  updateBranchPublicContent: async (branchId: string, payload: UpdatePublicContentPayload) => {
    return apiClient.patch(`/host/branches/${branchId}/public-content`, payload)
  },

  /** PATCH /host/branches/:branchId/resubmit-visibility: ask for review again after a deactivation. */
  resubmitBranchReview: async (branchId: string): Promise<ApiResponse<{ branch: BranchPublicContent }>> => {
    const { data } = await apiClient.patch(`/host/branches/${branchId}/resubmit-visibility`)
    return data
  },
}
