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
  /** Show to Travellers (NEW-112). Absent = the API's default. */
  isPublic?: boolean
}

export interface UpdatePlanPayload extends Partial<CreatePlanPayload> {
  status?: string
}

export const plansApi = {
  /** With `branchId`: that branch's plans plus the gym-wide ones (what the mobile listing editor shows). */
  getHostPlans: async (branchId?: string): Promise<ApiResponse<{ plans: MembershipPlan[] }>> => {
    const { data } = await apiClient.get('/membership-plans/host', { params: branchId ? { branchId } : undefined })
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
    const { data } = await apiClient.post(`/membership-plans/${id}/status`)
    return data
  },

  /** POST /membership-plans/:id/public: show to / hide from travellers (422 `last_visible_plan` on the last one). */
  togglePlanPublic: async (id: string): Promise<ApiResponse<{ isPublic: boolean }>> => {
    const { data } = await apiClient.post(`/membership-plans/${id}/public`)
    return data
  },

  /** The API reads the file from the multipart field `image` (`upload.image('image')`, NEW-227). */
  uploadPlanPoster: async (id: string, file: File): Promise<ApiResponse<{ posterUrl: string }>> => {
    const formData = new FormData()
    formData.append('image', file)
    const { data } = await apiClient.post(`/membership-plans/${id}/poster`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },
}
