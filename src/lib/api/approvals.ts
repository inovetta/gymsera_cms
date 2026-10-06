import apiClient from './client'
import { ApiResponse } from '@/types'

/**
 * Approvals API (UX-13). The same endpoints the mobile Approvals inbox calls
 * (gyms_era/lib/features/host/data/repositories/team_repository.dart).
 */

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'

export interface ApprovalRequest {
  id: string
  actionKey: string
  actionLabel: string
  module: string | null
  dangerous: boolean
  summary: string | null
  status: ApprovalStatus
  branch: { id: string; name: string } | null
  requestedBy: string | null
  requestedByName: string | null
  createdAt: string
  decisionReason: string | null
  /** Set when the payment was marked collected before the request was decided. */
  collectedBy: string | null
  collectedAt: string | null
  /** Only on an approved "add member" request: the status of the payment it created. */
  paymentStatus: string | null
}

/** Query key for "waiting on you", shared with the sidebar badge so a decision updates the count. */
export const APPROVALS_WAITING_KEY = ['approvals', 'PENDING'] as const

export const approvalsApi = {
  /** Requests waiting on the caller. Needs `approvals.view`. */
  list: async (status: string = 'PENDING'): Promise<ApiResponse<ApprovalRequest[]>> => {
    const { data } = await apiClient.get('/approvals', { params: { status } })
    return data
  },

  /** Requests the caller submitted. Needs no permission. */
  mine: async (status?: string): Promise<ApiResponse<ApprovalRequest[]>> => {
    const { data } = await apiClient.get('/approvals/mine', { params: status ? { status } : {} })
    return data
  },

  approve: async (id: string, reason?: string): Promise<ApiResponse<{ request: ApprovalRequest }>> => {
    const { data } = await apiClient.post(`/approvals/${id}/approve`, reason ? { reason } : {})
    return data
  },

  reject: async (id: string, reason: string): Promise<ApiResponse<{ request: ApprovalRequest }>> => {
    const { data } = await apiClient.post(`/approvals/${id}/reject`, { reason })
    return data
  },

  /** Withdraw your own pending request. */
  cancel: async (id: string): Promise<ApiResponse<{ request: ApprovalRequest }>> => {
    const { data } = await apiClient.post(`/approvals/${id}/cancel`)
    return data
  },
}

export interface ApprovalOutcome {
  /** True when the action was sent for approval instead of being carried out. */
  pending: boolean
  requestId: string | null
  summary: string | null
}

/**
 * Did an approval-tier action run, or was it sent for approval?
 *
 * The server answers 202 when the caller holds the permission at "Needs approval":
 * nothing has happened yet, and an approval request was created. 200/201 mean done.
 * Pass the whole axios response; the status is the contract, not the body.
 */
export const readApprovalOutcome = (response: { status: number; data?: unknown }): ApprovalOutcome => {
  if (response.status !== 202) return { pending: false, requestId: null, summary: null }
  const body = (response.data as { data?: Record<string, unknown> } | undefined)?.data ?? {}
  const id = body.approvalRequestId ?? body.requestId
  return {
    pending: true,
    requestId: typeof id === 'string' ? id : null,
    summary: typeof body.summary === 'string' ? body.summary : null,
  }
}
