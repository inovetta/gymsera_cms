import apiClient from './client'
import { ApiResponse, MembershipPlan } from '@/types'

export interface CreatePlanPayload {
  name: string
  description?: string
  branchId?: string
  durationType: string
  durationValue: number
  price: number
  joiningFee: number
  securityFee: number
  visitLimit?: number
  freezeLimitDays: number
  isTrial: boolean
}

export interface UpdatePlanPayload extends Partial<CreatePlanPayload> {
  status?: string
}

export const plansApi = {
  getHostPlans: async (): Promise<ApiResponse<{ plans: MembershipPlan[] }>> => {
    const { data } = await apiClient.get('/membership-plans/host')
    return data
  },

  createPlan: async (payload: CreatePlanPayload): Promise<ApiResponse<{ plan: MembershipPlan }>> => {
    const { data } = await apiClient.post('/membership-plans', payload)
    return data
  },

  updatePlan: async (id: string, payload: UpdatePlanPayload): Promise<ApiResponse<{ plan: MembershipPlan }>> => {
    const { data } = await apiClient.patch(`/membership-plans/${id}`, payload)
    return data
  },

  deletePlan: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/membership-plans/${id}`)
    return data
  },

  togglePlanStatus: async (id: string): Promise<ApiResponse<{ plan: MembershipPlan }>> => {
    const { data } = await apiClient.patch(`/membership-plans/${id}/toggle-status`)
    return data
  },

  uploadPlanPoster: async (id: string, file: File): Promise<ApiResponse<{ posterUrl: string }>> => {
    const formData = new FormData()
    formData.append('poster', file)
    const { data } = await apiClient.post(`/membership-plans/${id}/poster`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
