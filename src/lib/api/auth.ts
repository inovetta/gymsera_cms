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

// Same body the API validates (passwordResetConfirm); web and mobile send it too.
export interface ConfirmPasswordResetPayload {
  email: string
  code: string
  password: string
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<ApiResponse<LoginResponse>> => {
    const { data } = await apiClient.post('/auth/login', payload)
    return data
  },

  // The staff-only route, not the public /auth/social/google the website
  // uses — see auth.service.js#googleLogin's `staffOnly` mode. Never creates
  // a new account; refuses any Google account not already linked to an
  // existing GYM_HOST/BRANCH_MANAGER/PLATFORM_ADMIN user.
  googleLogin: async (idToken: string): Promise<ApiResponse<LoginResponse>> => {
    const { data } = await apiClient.post('/auth/social/google/staff', { idToken })
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
    const { data } = await apiClient.post('/auth/password-reset/request', payload)
    return data
  },

  confirmPasswordReset: async (payload: ConfirmPasswordResetPayload): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post('/auth/password-reset/confirm', payload)
    return data
  },
}
