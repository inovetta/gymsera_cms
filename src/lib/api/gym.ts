import apiClient from './client'
import { ApiResponse, Gym, Branch, GymStaff, User, MemberSubscription } from '@/types'

/**
 * What the server accepts to confirm a sensitive change (`assertReauth`): the password, or a
 * fresh Google ID token with `provider: 'GOOGLE'`.
 */
export interface ReauthFields {
  password?: string
  provider?: 'GOOGLE'
  idToken?: string
}

export interface UpdateGymProfilePayload extends ReauthFields {
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
  confirmOrganizationDeletion?: boolean
}

export const gymApi = {
  getGymProfile: async (): Promise<ApiResponse<{ gym: Gym }>> => {
    const { data } = await apiClient.get('/gyms/profile')
    return data
  },

  updateGymProfile: async (payload: UpdateGymProfilePayload): Promise<ApiResponse<{ gym: Gym }>> => {
    const { data } = await apiClient.patch('/gyms/profile', payload)
    return data
  },

  uploadGymLogo: async (file: File): Promise<ApiResponse<{ logoUrl: string }>> => {
    const formData = new FormData()
    formData.append('logo', file)
    const { data } = await apiClient.post('/gyms/profile/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  uploadGymCover: async (file: File): Promise<ApiResponse<{ coverImageUrl: string }>> => {
    const formData = new FormData()
    formData.append('cover', file)
    const { data } = await apiClient.post('/gyms/profile/cover', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  getBranches: async (): Promise<ApiResponse<{ gym: Gym; branches: Branch[] }>> => {
    const { data } = await apiClient.get('/gyms/branches')
    return data
  },

  createBranch: async (payload: CreateBranchPayload): Promise<ApiResponse<{ branch: Branch }>> => {
    const { data } = await apiClient.post('/gyms/branches', payload)
    return data
  },

  getBranch: async (id: string): Promise<ApiResponse<{ branch: Branch }>> => {
    const { data } = await apiClient.get(`/gyms/branches/${id}`)
    return data
  },

  updateBranch: async (id: string, payload: UpdateBranchPayload): Promise<ApiResponse<{ branch: Branch }>> => {
    const { data } = await apiClient.patch(`/gyms/branches/${id}`, payload)
    return data
  },

  deleteBranch: async (id: string, payload?: DeleteBranchPayload): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/gyms/branches/${id}`, { data: payload })
    return data
  },

  getBranchStaff: async (branchId: string): Promise<ApiResponse<{ branch: Branch; staff: GymStaff[] }>> => {
    const { data } = await apiClient.get(`/gyms/branches/${branchId}/staff`)
    return data
  },

  uploadGymImages: async (files: File[]): Promise<ApiResponse<{ gym: Gym; uploadedUrls: string[] }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post('/gyms/profile/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  deleteGymImage: async (imageUrl: string): Promise<ApiResponse<{ gym: Gym }>> => {
    const { data } = await apiClient.delete('/gyms/profile/images', { data: { imageUrl } })
    return data
  },

  uploadBranchImages: async (branchId: string, files: File[]): Promise<ApiResponse<{ branch: Branch; uploadedUrls: string[] }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post(`/gyms/branches/${branchId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  deleteBranchImage: async (branchId: string, imageUrl: string): Promise<ApiResponse<{ branch: Branch }>> => {
    const { data } = await apiClient.delete(`/gyms/branches/${branchId}/images`, { data: { imageUrl } })
    return data
  },

  getMembers: async (params?: { q?: string; status?: string; page?: number; limit?: number }): Promise<ApiResponse<{ members: User[] }>> => {
    const { data } = await apiClient.get('/gyms/members', { params })
    return data
  },

  searchMember: async (email: string): Promise<ApiResponse<{ user: User | null }>> => {
    const { data } = await apiClient.get('/gyms/members/search', { params: { email } })
    return data
  },

  enrollMember: async (payload: EnrollMemberPayload): Promise<ApiResponse<{ user: User; subscription: MemberSubscription; userCreated: boolean }>> => {
    const { data } = await apiClient.post('/gyms/members/enroll', payload)
    return data
  },
}
