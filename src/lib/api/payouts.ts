import type { AxiosResponse } from 'axios'
import apiClient from './client'
import { idempotencyHeaders } from './idempotency'
import { ApiResponse } from '@/types'

/**
 * Payouts (PAY-10, SEC-13): `gymsera_be/src/routes/host.routes.js:18-20`.
 *
 * The balance is derived by the server from the ledger (collected - refunded - expenses -
 * payouts). The browser shows it; it never works one out. The mobile app has no payouts client
 * yet (its screens keep a local list), so the backend is the contract here.
 */

export interface PayoutBalance {
  branchId: string | null
  totalCollected: number
  totalRefunded: number
  totalExpenses: number
  totalPayouts: number
  availableBalance: number
  currency: string
}

export type PayoutStatus = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED'

export interface Payout {
  id: string
  branchId: string | null
  amount: number
  currency: string
  status: PayoutStatus
  destinationJson?: Record<string, unknown> | null
  notes?: string | null
  paidAt?: string | null
  transactionRef?: string | null
  createdAt: string
}

export interface RequestPayoutPayload {
  /** Leave out for the whole organization; set to take it from one branch's ledger. */
  branchId?: string
  /** Major units, two decimals at most. */
  amount: number
  notes?: string
}

export interface BankDetails {
  bankName?: string
  accountTitle?: string
  accountNumber?: string
  iban?: string
  branchCode?: string
  jazzCashNumber?: string
  easyPaisaNumber?: string
  additionalInstructions?: string
}

export const payoutsApi = {
  balance: async (branchId?: string): Promise<ApiResponse<PayoutBalance>> => {
    const { data } = await apiClient.get('/host/payouts/balance', { params: branchId ? { branchId } : undefined })
    return data
  },

  list: async (params: { branchId?: string; page?: number; limit?: number } = {}): Promise<ApiResponse<{ payouts: Payout[] }>> => {
    const { data } = await apiClient.get('/host/payouts', { params })
    return data
  },

  /**
   * POST /host/payouts needs an Idempotency-Key and answers **201** (created) or **202** (sent to
   * the approval inbox). The whole response is returned: read the status with `readApprovalOutcome`.
   */
  request: async (payload: RequestPayoutPayload, idempotencyKey: string): Promise<AxiosResponse> =>
    apiClient.post('/host/payouts', payload, { headers: idempotencyHeaders(idempotencyKey) }),
}
