import apiClient from './client'
import { fetchPrivateFile } from './private-file'
import { ApiResponse } from '@/types'
import { PlanPaymentRequest, PlanPaymentStatus } from './host-billing'

/** Platform admin: host plan payments by bank transfer (P9c item D, R-95). */
export const adminPlanPaymentsApi = {
  list: async (status?: PlanPaymentStatus): Promise<ApiResponse<{ requests: PlanPaymentRequest[] }>> => {
    const { data } = await apiClient.get('/admin/plan-payments', { params: status ? { status } : {} })
    return data
  },
  approve: async (id: string): Promise<ApiResponse<{ request: PlanPaymentRequest }>> => {
    const { data } = await apiClient.post(`/admin/plan-payments/${id}/approve`, {})
    return data
  },
  reject: async (id: string, reason: string): Promise<ApiResponse<{ request: PlanPaymentRequest }>> => {
    const { data } = await apiClient.post(`/admin/plan-payments/${id}/reject`, { reason })
    return data
  },
  /** The receipt (private; admin only, audited). */
  proof: (id: string): Promise<Blob> => fetchPrivateFile(`/api/v1/admin/plan-payments/${id}/proof`),
}
