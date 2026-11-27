import apiClient from './client'

/**
 * The organization the signed-in person works in, in the names of API contract v2 (R-120):
 * `/organizations/me…` (was `/tenants/me` and the staff routes under `/gyms/…`).
 */
import { ApiResponse, BusinessProfile, Branch, BranchStaff, User, MemberSubscription, OrganizationMember, MembershipDisplayStatus, Organization, OrganizationSubscription, PlatformPackage } from '@/types'

/**
 * What the server accepts to confirm a sensitive change (`assertReauth`): the password, or a
 * fresh Google ID token with `provider: 'GOOGLE'`.
 */
export interface ReauthFields {
  password?: string
  provider?: 'GOOGLE'
  idToken?: string
}

export interface UpdateBusinessProfilePayload extends ReauthFields {
  /** Payout bank details (SEC-13): needs payouts.bank.manage AND a re-auth credential. */
  paymentDetailsJson?: Record<string, unknown>
  name?: string
  description?: string
  genderType?: string
  phone?: string
  email?: string
  address?: string
  latitude?: number
  longitude?: number
}

export interface CreateBranchPayload {
  /** The business the branch is added to (contract v2: was `gymListingId`). */
  businessId: string
  branchName: string
  address: string
  cityId: number
  areaId?: number
  phone?: string
  openingTime?: string
  closingTime?: string
  facilities?: string[]
  latitude?: number
  longitude?: number
  packages?: Array<{
    name: string
    price: number
    durationType?: string
    durationValue?: number
    description?: string
  }>
}

export interface UpdateBranchPayload {
  /** NEW-265: a pending area request instead of areaId; null clears it. */
  areaRequestId?: number | null
  branchName?: string
  address?: string
  cityId?: number
  areaId?: number
  phone?: string
  openingTime?: string
  closingTime?: string
  facilities?: string[]
  latitude?: number
  longitude?: number
  status?: string
}

export interface EnrollMemberPayload {
  email: string
  fullName?: string
  phone?: string
  planId: string
  branchId: string
  startDate?: string
}

export interface DeleteBranchPayload {
  password?: string
  provider?: string
  idToken?: string
  confirmBusinessDeletion?: boolean
}

/** PATCH /organizations/me (contract v2 row 44). */
export interface UpdateOrganizationPayload {
  organizationName?: string
  email?: string
  phone?: string
  cityId?: number
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const organizationsApi = {
  getMine: async (): Promise<ApiResponse<{ organization: Organization; subscription: OrganizationSubscription | null }>> => {
    const { data } = await apiClient.get('/organizations/me')
    return data
  },

  updateMine: async (payload: UpdateOrganizationPayload): Promise<ApiResponse<{ organization: Organization }>> => {
    const { data } = await apiClient.patch('/organizations/me', payload)
    return data
  },

  selectPackage: async (organizationId: string, packageId: string): Promise<ApiResponse<{ organization: Organization; package: PlatformPackage }>> => {
    const { data } = await apiClient.post(`/organizations/${organizationId}/select-package`, { packageId })
    return data
  },

  getPackages: async (): Promise<ApiResponse<{ packages: PlatformPackage[] }>> => {
    const { data } = await apiClient.get('/platform-packages')
    return data
  },

  /** One business per call; the caller names it (contract v2 rows 146-151, F2). */
  getBusinessProfile: async (businessId: string): Promise<ApiResponse<{ business: BusinessProfile }>> => {
    const { data } = await apiClient.get(`/organizations/me/businesses/${businessId}/profile`)
    return data
  },

  updateBusinessProfile: async (businessId: string, payload: UpdateBusinessProfilePayload): Promise<ApiResponse<{ business: BusinessProfile }>> => {
    const { data } = await apiClient.patch(`/organizations/me/businesses/${businessId}/profile`, payload)
    return data
  },

  uploadBusinessLogo: async (businessId: string, file: File): Promise<ApiResponse<{ logoUrl: string }>> => {
    const formData = new FormData()
    formData.append('logo', file)
    const { data } = await apiClient.post(`/organizations/me/businesses/${businessId}/profile/logo`, formData, multipart)
    return data
  },

  uploadBusinessCover: async (businessId: string, file: File): Promise<ApiResponse<{ coverImageUrl: string }>> => {
    const formData = new FormData()
    formData.append('cover', file)
    const { data } = await apiClient.post(`/organizations/me/businesses/${businessId}/profile/cover`, formData, multipart)
    return data
  },

  uploadBusinessImages: async (businessId: string, files: File[]): Promise<ApiResponse<{ business: BusinessProfile; uploadedUrls: string[] }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post(`/organizations/me/businesses/${businessId}/profile/images`, formData, multipart)
    return data
  },

  deleteBusinessImage: async (businessId: string, imageUrl: string): Promise<ApiResponse<{ business: BusinessProfile }>> => {
    const { data } = await apiClient.delete(`/organizations/me/businesses/${businessId}/profile/images`, { data: { imageUrl } })
    return data
  },

  /** The branches the person may see in this organization (contract v2 row 152). */
  getBranches: async (): Promise<ApiResponse<{ branches: Branch[] }>> => {
    const { data } = await apiClient.get('/organizations/me/branches')
    return data
  },

  createBranch: async (payload: CreateBranchPayload): Promise<ApiResponse<{ branch: Branch }>> => {
    const { data } = await apiClient.post('/organizations/me/branches', payload)
    return data
  },

  getBranch: async (branchId: string): Promise<ApiResponse<{ branch: Branch }>> => {
    const { data } = await apiClient.get(`/organizations/me/branches/${branchId}`)
    return data
  },

  updateBranch: async (branchId: string, payload: UpdateBranchPayload): Promise<ApiResponse<{ branch: Branch }>> => {
    const { data } = await apiClient.patch(`/organizations/me/branches/${branchId}`, payload)
    return data
  },

  deleteBranch: async (branchId: string, payload?: DeleteBranchPayload): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/organizations/me/branches/${branchId}`, { data: payload })
    return data
  },

  getBranchStaff: async (branchId: string): Promise<ApiResponse<{ branch: Branch; staff: BranchStaff[] }>> => {
    const { data } = await apiClient.get(`/organizations/me/branches/${branchId}/staff`)
    return data
  },

  uploadBranchImages: async (branchId: string, files: File[]): Promise<ApiResponse<{ branch: Branch; uploadedUrls: string[] }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post(`/organizations/me/branches/${branchId}/images`, formData, multipart)
    return data
  },

  deleteBranchImage: async (branchId: string, imageUrl: string): Promise<ApiResponse<{ branch: Branch }>> => {
    const { data } = await apiClient.delete(`/organizations/me/branches/${branchId}/images`, { data: { imageUrl } })
    return data
  },

  /** NEW-244: `status` is the account status, `membershipStatus` the plan status (Active, Expiring, ...). */
  getMembers: async (params?: {
    q?: string
    status?: string
    membershipStatus?: MembershipDisplayStatus
    page?: number
    limit?: number
  }): Promise<ApiResponse<{ members: OrganizationMember[] }>> => {
    const { data } = await apiClient.get('/organizations/me/members', { params })
    return data
  },

  searchMember: async (email: string): Promise<ApiResponse<{ user: User | null }>> => {
    const { data } = await apiClient.get('/organizations/me/members/search', { params: { email } })
    return data
  },

  enrollMember: async (payload: EnrollMemberPayload): Promise<ApiResponse<{ user: User; subscription: MemberSubscription; userCreated: boolean }>> => {
    const { data } = await apiClient.post('/organizations/me/members/enroll', payload)
    return data
  },
}
