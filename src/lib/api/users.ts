import apiClient from './client'
import { ApiResponse, User } from '@/types'

export interface GetUsersParams {
  page?: number
  limit?: number
  search?: string
  role?: string
  status?: string
}

export interface CreateUserPayload {
  fullName: string
  email: string
  phone?: string
  role: string
  password: string
}

export interface UpdateUserPayload {
  fullName?: string
  email?: string
  phone?: string
  status?: string
}

export interface UpdateUserStatusPayload {
  status: string
  reason?: string
}

export interface ResetPasswordPayload {
  newPassword: string
}

export interface AccountStatementParams {
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

export const usersApi = {
  getUsers: async (params?: GetUsersParams): Promise<ApiResponse<{ users: User[] }>> => {
    const { data } = await apiClient.get('/users', { params })
    return data
  },

  getUser: async (id: string): Promise<ApiResponse<{ user: User }>> => {
    const { data } = await apiClient.get(`/users/${id}`)
    return data
  },

  createUser: async (payload: CreateUserPayload): Promise<ApiResponse<{ user: User }>> => {
    const { data } = await apiClient.post('/users', payload)
    return data
  },

  updateUser: async (id: string, payload: UpdateUserPayload): Promise<ApiResponse<{ user: User }>> => {
    const { data } = await apiClient.patch(`/users/${id}`, payload)
    return data
  },

  updateUserStatus: async (id: string, payload: UpdateUserStatusPayload): Promise<ApiResponse<{ user: User }>> => {
    const { data } = await apiClient.patch(`/users/${id}/status`, payload)
    return data
  },

  resetUserPassword: async (id: string, payload: ResetPasswordPayload): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post(`/users/${id}/reset-password`, payload)
    return data
  },

  uploadProfileImage: async (id: string, file: File): Promise<ApiResponse<{ profileImageUrl: string }>> => {
    const formData = new FormData()
    formData.append('image', file)
    const { data } = await apiClient.post(`/users/${id}/profile-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  getAccountStatement: async (id: string, params?: AccountStatementParams): Promise<ApiResponse<unknown>> => {
    const { data } = await apiClient.get(`/users/${id}/account-statement`, { params })
    return data
  },
}
