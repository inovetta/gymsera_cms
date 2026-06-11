import apiClient from './client'
import { ApiResponse, Payment, Invoice } from '@/types'

export interface GetPaymentsParams {
  page?: number
  limit?: number
  status?: string
  method?: string
  userId?: string
  branchId?: string
  from?: string
  to?: string
}

export interface RecordPaymentPayload {
  userId: string
  paymentFor: string
  amount: number
  currency?: string
  method: string
  referenceEntityId?: string
  branchId?: string
  notes?: string
}

export interface PaymentActionPayload {
  action: 'collect' | 'verify' | 'reject'
  notes?: string
  rejectedReason?: string
}

export const paymentsApi = {
  getPayments: async (params?: GetPaymentsParams): Promise<ApiResponse<{ payments: Payment[] }>> => {
    const { data } = await apiClient.get('/payments', { params })
    return data
  },

  getPayment: async (id: string): Promise<ApiResponse<{ payment: Payment }>> => {
    const { data } = await apiClient.get(`/payments/${id}`)
    return data
  },

  recordPayment: async (payload: RecordPaymentPayload): Promise<ApiResponse<{ payment: Payment; invoice: Invoice | null }>> => {
    const { data } = await apiClient.post('/payments', payload)
    return data
  },

  /** Unified action: collect (staff step 1), verify (tenant final), or reject */
  paymentAction: async (id: string, payload: PaymentActionPayload): Promise<ApiResponse<{ payment: Payment }>> => {
    const { data } = await apiClient.post(`/payments/${id}/action`, payload)
    return data
  },

  /** Batch staff collection — marks multiple PENDING payments as STAFF_COLLECTED */
  batchCollect: async (paymentIds: string[]): Promise<ApiResponse<{ collected: number }>> => {
    const { data } = await apiClient.post('/payments/collection-action', { paymentIds })
    return data
  },

  uploadProof: async (id: string, file: File): Promise<ApiResponse<{ payment: Payment }>> => {
    const formData = new FormData()
    formData.append('image', file)
    const { data } = await apiClient.post(`/payments/${id}/proof`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  getInvoices: async (params?: { userId?: string; status?: string; page?: number; limit?: number }): Promise<ApiResponse<{ invoices: Invoice[] }>> => {
    const { data } = await apiClient.get('/invoices', { params })
    return data
  },

  getInvoice: async (id: string): Promise<ApiResponse<{ invoice: Invoice }>> => {
    const { data } = await apiClient.get(`/invoices/${id}`)
    return data
  },

  // Legacy alias kept for any existing callers
  verifyOrRejectPayment: async (id: string, payload: PaymentActionPayload): Promise<ApiResponse<{ payment: Payment }>> => {
    const { data } = await apiClient.post(`/payments/${id}/action`, payload)
    return data
  },
}
