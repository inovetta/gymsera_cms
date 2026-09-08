import apiClient from './client'
import { ApiResponse, Gym, Branch, GymStaff, User, MemberSubscription } from '@/types'

export interface CreateStaffPayload {
  fullName: string
  email: string
  phone?: string
  password?: string
  designation?: string
  branchIds?: string[]
  assignToAllBranches?: boolean
}

export interface UpdateGymProfilePayload {
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

export interface AddStaffPayload {
  email: string
  designation: string
}

export interface EnrollMemberPayload {
  email: string
  fullName?: string
  phone?: string
  planId: string
  branchId: string
  startDate?: string
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

  deleteBranch: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/gyms/branches/${id}`)
    return data
  },

  getBranchStaff: async (branchId: string): Promise<ApiResponse<{ branch: Branch; staff: GymStaff[] }>> => {
    const { data } = await apiClient.get(`/gyms/branches/${branchId}/staff`)
    return data
  },

  addStaff: async (branchId: string, payload: AddStaffPayload): Promise<ApiResponse<{ staffMember: GymStaff }>> => {
    const { data } = await apiClient.post(`/gyms/branches/${branchId}/staff`, payload)
    return data
  },

  removeStaff: async (branchId: string, staffId: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/gyms/branches/${branchId}/staff/${staffId}`)
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

  // ── Gym-wide staff management ─────────────────────────────────────────────

  listAllStaff: async (): Promise<ApiResponse<{ staff: GymStaff[] }>> => {
    const { data } = await apiClient.get('/gyms/staff')
    return data
  },

  createStaff: async (payload: CreateStaffPayload): Promise<ApiResponse<{ user: User; assignedBranches: number; tempPassword?: string }>> => {
    const { data } = await apiClient.post('/gyms/staff', payload)
    return data
  },

  removeStaffUser: async (userId: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/gyms/staff/${userId}`)
    return data
  },
}
