import apiClient from './client'
import { ApiResponse, User } from '@/types'

export interface LoginPayload {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export interface PasswordResetPayload {
  email: string
}

export interface ConfirmPasswordResetPayload {
  token: string
  newPassword: string
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<ApiResponse<LoginResponse>> => {
    const { data } = await apiClient.post('/auth/login', payload)
    return data
  },

  logout: async (): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post('/auth/logout')
    return data
  },

  refresh: async (refreshToken: string): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> => {
    const { data } = await apiClient.post('/auth/refresh', { refreshToken })
    return data
  },

  getMe: async (): Promise<ApiResponse<User>> => {
    const { data } = await apiClient.get('/auth/me')
    return data
  },

  requestPasswordReset: async (payload: PasswordResetPayload): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post('/auth/forgot-password', payload)
    return data
  },

  confirmPasswordReset: async (payload: ConfirmPasswordResetPayload): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post('/auth/reset-password', payload)
    return data
  },
}
