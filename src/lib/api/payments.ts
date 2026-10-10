import type { AxiosResponse } from 'axios'
import apiClient from './client'
import { idempotencyHeaders } from './idempotency'
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
  /** The shift the money was taken in (PAY-06); the server keeps up to 20 characters. */
  shift?: string
}

export interface PaymentActionPayload {
  action: 'collect' | 'verify' | 'reject'
  notes?: string
  rejectedReason?: string
  /** The shift a collection belongs to (PAY-06). */
  shift?: string
}

export interface RefundPayload {
  /** Major units with at most two decimals; leave out to refund what is left of the payment. */
  amount?: number
  reason: string
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

  /**
   * POST /payments needs an Idempotency-Key (400 `idempotency_key_required` without it:
   * gymsera_be/src/routes/payments.routes.js:98-101). One key per user intent.
   */
  recordPayment: async (
    payload: RecordPaymentPayload,
    idempotencyKey: string
  ): Promise<ApiResponse<{ payment: Payment; invoice: Invoice | null }>> => {
    const { data } = await apiClient.post('/payments', payload, { headers: idempotencyHeaders(idempotencyKey) })
    return data
  },

  /**
   * POST /payments/:id/refund. Answers 200 when the refund ran and **202** when it went to the
   * approval inbox, so the whole response is returned: read the status with `readApprovalOutcome`.
   */
  refundPayment: async (id: string, payload: RefundPayload, idempotencyKey: string): Promise<AxiosResponse> =>
    apiClient.post(`/payments/${id}/refund`, payload, { headers: idempotencyHeaders(idempotencyKey) }),

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
