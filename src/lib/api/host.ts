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
  [key: string]: unknown
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
  phone?: string
  openingTime?: string
  closingTime?: string
  facilitiesJson?: string[]
  packages: Array<{ name: string; price: number; durationType?: string; durationValue?: number; description?: string }>
}

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
}
