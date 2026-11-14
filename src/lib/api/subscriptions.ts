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

  // NEW-250: staff routes. /subscriptions/:id/freeze|cancel are the member's own routes and answer
  // 404 for staff (NEW-08). 200 = done; 202 = sent for approval (the caller's tier is REQUEST).
  freezeSubscription: async (id: string, payload: { freezeFrom: string; freezeTo: string }): Promise<ApiResponse<StaffSubscriptionActionResult>> => {
    const { data } = await apiClient.post(`/subscriptions/staff/${id}/freeze`, payload)
    return data
  },

  cancelSubscription: async (id: string): Promise<ApiResponse<StaffSubscriptionActionResult>> => {
    const { data } = await apiClient.post(`/subscriptions/staff/${id}/cancel`, {})
    return data
  },
}

export interface StaffSubscriptionActionResult {
  status: 'EXECUTED' | 'PENDING'
  subscription?: MemberSubscription
  requestId?: string
  summary?: string
}

/** The toast after a staff Freeze / Cancel: say "sent for approval" when nothing changed yet. */
export const staffActionToast = (result: StaffSubscriptionActionResult | undefined, doneTitle: string) =>
  result?.status === 'PENDING'
    ? { title: 'Sent for approval', description: 'It applies once a manager approves it.' }
    : { title: doneTitle }
