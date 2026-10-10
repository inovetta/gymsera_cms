import type { AxiosResponse } from 'axios'
import apiClient from './client'
import { idempotencyHeaders } from './idempotency'
import { ApiResponse } from '@/types'

/**
 * Collection ledger (PAY-04/06/11/12). The same endpoints the mobile team workspace calls
 * (gyms_era/lib/features/me/data/repositories/workspace_repository.dart:285-400).
 *
 * Amounts are major units as numbers with at most two decimals, already totalled by the server:
 * the CMS formats them and never adds them up.
 */

export interface LedgerTotals {
  expected: number
  collected: number
  verified: number
  pending: number
  variance: number
}

export interface LedgerShift {
  shift: string
  total: number
  cashCollected: number
  cashExpected: number
  count: number
}

export interface LedgerCollector {
  collectorId: string
  collectorName?: string
  total: number
  cashCollected: number
  cashExpected: number
  count: number
  shifts: Record<string, LedgerShift>
}

export interface LedgerPayment {
  id: string
  userId: string
  amount: number
  method: string
  status: string
  businessDate?: string
  paidAt?: string | null
  shift?: string | null
  branchId?: string
  branchName?: string
}

export interface LedgerAdjustment {
  id: string
  type: string
  amount: number | null
  reason: string
  createdAt: string
  createdBy?: string | null
}

export interface LedgerDayRecord {
  id: string
  branchId: string
  businessDate: string
  status: 'OPEN' | 'CLOSED'
  closedAt?: string | null
  closedExpectedTotal?: number | null
  closedCollectedTotal?: number | null
}

/** One branch, one business date (GET /ledger/today, GET /ledger/day/:date). */
export interface LedgerDayView {
  ledgerDay: LedgerDayRecord
  businessDate: string
  isMissed: boolean
  payments: LedgerPayment[]
  totals: LedgerTotals
  byMethod: Record<string, number>
  byCollector: LedgerCollector[]
  adjustments: LedgerAdjustment[]
}

export interface LedgerBranchSummary {
  branchId: string
  branchName: string
  businessDate: string
  isMissed: boolean
  totals: LedgerTotals
}

/** A week or month, one branch (GET /ledger/weekly|monthly?branchId). */
export interface LedgerRangeView {
  fromDate: string
  toDate: string
  totals: LedgerTotals
  byMethod: Record<string, number>
  byCollector: LedgerCollector[]
  perDay?: { businessDate: string; status: 'OPEN' | 'CLOSED'; expected: number; collected: number; verified: number }[]
  /** Only on the gym-wide (owner) view. */
  branches?: LedgerBranchSummary[]
  payments?: LedgerPayment[]
}

/** Gym-wide today (GET /ledger/today with no branchId, owner only). */
export interface LedgerAllBranchesView extends LedgerRangeView {
  branches: LedgerBranchSummary[]
}

export interface OpenLedgerDay {
  id: string
  branchId: string
  businessDate: string
  status: 'OPEN'
  branchName?: string
}

export type AdjustmentType = 'DISCREPANCY_NOTE' | 'VARIANCE_ADJUSTMENT' | 'REVERSAL' | 'MISSED_DAY_RECONCILIATION'

export interface AdjustmentPayload {
  branchId: string
  type: AdjustmentType
  reason: string
  /** Signed, major units, two decimals at most. Optional for a note. */
  amount?: number
  relatedPaymentId?: string
}

const params = (branchId?: string | null, extra: Record<string, string | undefined> = {}) => {
  const out: Record<string, string> = {}
  if (branchId) out.branchId = branchId
  for (const [k, v] of Object.entries(extra)) if (v) out[k] = v
  return out
}

export const ledgerApi = {
  today: async (branchId?: string | null): Promise<ApiResponse<LedgerDayView | LedgerAllBranchesView>> => {
    const { data } = await apiClient.get('/ledger/today', { params: params(branchId) })
    return data
  },

  day: async (businessDate: string, branchId: string): Promise<ApiResponse<LedgerDayView>> => {
    const { data } = await apiClient.get(`/ledger/day/${businessDate}`, { params: params(branchId) })
    return data
  },

  openDays: async (branchId?: string | null): Promise<ApiResponse<{ days: OpenLedgerDay[] }>> => {
    const { data } = await apiClient.get('/ledger/open-days', { params: params(branchId) })
    return data
  },

  weekly: async (branchId?: string | null, businessDate?: string): Promise<ApiResponse<LedgerRangeView>> => {
    const { data } = await apiClient.get('/ledger/weekly', { params: params(branchId, { businessDate }) })
    return data
  },

  monthly: async (branchId?: string | null, businessDate?: string): Promise<ApiResponse<LedgerRangeView>> => {
    const { data } = await apiClient.get('/ledger/monthly', { params: params(branchId, { businessDate }) })
    return data
  },

  /**
   * POST /ledger/:ledgerDayId/adjustments goes through the approval engine (PAY-12): **201** when
   * recorded, **202** when it was sent for approval. The whole response is returned so the page
   * reads the status with `readApprovalOutcome`.
   */
  addAdjustment: async (ledgerDayId: string, payload: AdjustmentPayload, idempotencyKey: string): Promise<AxiosResponse> =>
    apiClient.post(`/ledger/${ledgerDayId}/adjustments`, payload, { headers: idempotencyHeaders(idempotencyKey) }),

  /**
   * Closing a day is the registered command `ledger.close`, through POST /actions/ledger.close
   * (the mobile `performAction`): **200** `{status:'EXECUTED'}` or **202** `{status:'PENDING'}`.
   */
  closeDay: async (
    branchId: string,
    day: { ledgerDayId: string; businessDate: string },
    idempotencyKey: string
  ): Promise<AxiosResponse> =>
    apiClient.post('/actions/ledger.close', { branchId, payload: day, idempotencyKey }),
}

export const isAllBranchesView = (v: LedgerDayView | LedgerAllBranchesView): v is LedgerAllBranchesView =>
  Array.isArray((v as LedgerAllBranchesView).branches) && !(v as LedgerDayView).ledgerDay
