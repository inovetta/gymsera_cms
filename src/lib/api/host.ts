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
}
