import apiClient from './client'
import { ApiResponse, MemberSubscription, Payment, Invoice } from '@/types'

export interface GetSubscriptionsParams {
  page?: number
  limit?: number
  status?: string
  branchId?: string
  userId?: string
}

export interface PreviewSubscriptionPayload {
  planId: string
  startDate?: string
  autoRenew?: boolean
}

export interface RecordPaymentForSubPayload {
  userId: string
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'WALLET'
  amount: number
  referenceEntityId: string
  notes?: string
}

export const subscriptionsApi = {
  getStaffSubscriptions: async (params?: GetSubscriptionsParams): Promise<ApiResponse<{ subscriptions: MemberSubscription[] }>> => {
    const { data } = await apiClient.get('/subscriptions/staff', { params })
    return data
  },

  getStaffSubscription: async (id: string): Promise<ApiResponse<{ subscription: MemberSubscription; payments: Payment[]; invoice: Invoice | null }>> => {
    const { data } = await apiClient.get(`/subscriptions/staff/${id}`)
    return data
  },

  previewSubscription: async (payload: PreviewSubscriptionPayload): Promise<ApiResponse<any>> => {
    const { data } = await apiClient.post('/subscriptions/preview', payload)
    return data
  },

  activateSubscription: async (id: string): Promise<ApiResponse<{ subscription: MemberSubscription }>> => {
    const { data } = await apiClient.post(`/subscriptions/staff/${id}/activate`)
    return data
  },

  freezeSubscription: async (id: string, payload: { freezeFrom: string; freezeTo: string }): Promise<ApiResponse<{ subscription: MemberSubscription }>> => {
    const { data } = await apiClient.post(`/subscriptions/${id}/freeze`, payload)
    return data
  },

  cancelSubscription: async (id: string): Promise<ApiResponse<{ subscription: MemberSubscription }>> => {
    const { data } = await apiClient.post(`/subscriptions/${id}/cancel`)
    return data
  },
}
