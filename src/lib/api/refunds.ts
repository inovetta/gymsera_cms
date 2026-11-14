import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * NEW-253 (R-103): refunds on subscription cancellation. Same endpoints as the app.
 * The server decides everything (policy, window, amount limits, who may refund); the CMS only shows
 * what the quote says and sends what the user chose.
 */

export type RefundTier = 'DIRECT' | 'REQUEST' | 'OFF'

export type RefundReasonCode =
  | 'refunds_disabled'
  | 'no_refundable_payment'
  | 'already_refunded'
  | 'refund_window_closed'
  | 'not_cancelled'
  | 'already_requested'

export interface RefundQuote {
  subscriptionId: string
  refundsAllowed: boolean
  refundWindowDays: number | null
  eligible: boolean
  reasonCode: RefundReasonCode | null
  reason: string | null
  paymentId?: string
  method?: string
  currency?: string
  paidAt?: string
  paymentAmount?: string
  remainingRefundable?: string
  suggestedAmount?: string
  periodDays?: number
  unusedDays?: number
  windowEndsAt?: string | null
  refundTier: RefundTier
}

export interface RefundRequestRow {
  id: string
  subscriptionId: string
  paymentId: string
  userId: string
  branchId: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  currency: string
  suggestedAmount: string
  approvedAmount: string | null
  reason: string | null
  decidedBy: string | null
  decidedAt: string | null
  decisionReason: string | null
  createdAt: string
}

export interface RefundPolicy {
  gymId: string | null
  refundsAllowed: boolean
  refundWindowDays: number | null
}

export const REFUND_REQUESTS_KEY = ['refund-requests'] as const

export const refundsApi = {
  quote: async (subscriptionId: string): Promise<ApiResponse<RefundQuote>> => {
    const { data } = await apiClient.get(`/subscriptions/staff/${subscriptionId}/refund-quote`)
    return data
  },

  listRequests: async (status: string = 'PENDING'): Promise<ApiResponse<{ requests: RefundRequestRow[] }>> => {
    const { data } = await apiClient.get('/subscriptions/staff/refund-requests', { params: { status } })
    return data
  },

  decide: async (
    requestId: string,
    body: { decision: 'APPROVE' | 'REJECT'; amount?: number; reason?: string }
  ): Promise<ApiResponse<{ request: RefundRequestRow }>> => {
    const { data } = await apiClient.post(`/subscriptions/staff/refund-requests/${requestId}/decide`, body)
    return data
  },

  getPolicy: async (): Promise<ApiResponse<RefundPolicy>> => {
    const { data } = await apiClient.get('/subscriptions/staff/refund-policy')
    return data
  },

  updatePolicy: async (body: { refundsAllowed?: boolean; refundWindowDays?: number | null }): Promise<ApiResponse<RefundPolicy>> => {
    const { data } = await apiClient.put('/subscriptions/staff/refund-policy', body)
    return data
  },
}

/**
 * The cancel dialog offers "Return the payment?" only when the server says a refund is possible and
 * the caller may refund (directly, or through approval). Policy off = never offered (R-103 item 7).
 */
export const refundOffer = (q: RefundQuote | null | undefined) => {
  if (!q || !q.eligible || q.refundTier === 'OFF') return null
  return {
    suggested: Number(q.suggestedAmount ?? 0),
    max: Number(q.remainingRefundable ?? 0),
    currency: q.currency ?? 'PKR',
    needsApproval: q.refundTier === 'REQUEST',
  }
}

/** A typed amount the dialog may send: > 0 and ≤ the refundable balance (the server checks again). */
export const refundAmountError = (value: string, max: number): string | null => {
  const n = Number(value)
  if (value.trim() === '' || !Number.isFinite(n) || n <= 0) return 'Enter an amount greater than zero'
  if (Math.round(n * 100) > Math.round(max * 100)) return `At most ${max.toFixed(2)}`
  return null
}

/** The toast after a cancel with refund. */
export const cancelRefundToast = (result: { status?: string; refund?: { status?: string } } | undefined) => {
  if (result?.status === 'PENDING') return { title: 'Sent for approval', description: 'It applies once a manager approves it.' }
  if (result?.refund?.status === 'PENDING') return { title: 'Subscription cancelled', description: 'The refund was sent for approval.' }
  if (result?.refund?.status === 'EXECUTED') return { title: 'Subscription cancelled and payment refunded', description: 'Return the money to the member.' }
  return { title: 'Subscription cancelled' }
}
