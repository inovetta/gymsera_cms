import apiClient from './client'
import { ApiResponse, TenantSubscription } from '@/types'

// The same branch-count catalog row shape gyms_era's billing_plan.dart
// consumes — see billing.controller.js#getPlans. Public/unauthenticated on
// the backend (no product IDs a browser shouldn't see are exposed without
// ?platform=), but calling it from an authenticated CMS session is fine.
export interface CatalogPlan {
  id: string
  branchCount: number
  /** BUG-24: the tier label from the API's one table (constants/plan-tiers.js). */
  tierName?: string | null
  monthlyPrice: number
  annualPrice: number
  currency: string
}

/** GET /billing/bank-instructions (UX-15, R-86): the platform account, from the API's env, never typed in here. */
export interface BankTransferInstructions {
  bankName: string | null
  accountTitle: string | null
  accountNumber: string | null
  iban: string | null
  swiftCode: string | null
  currency: string
  instructions: string | null
}

/** What GET /host/subscription/current says about a plan that no longer entitles (P7c, R-82). */
export interface SubscriptionLapse {
  status: string
  reason: 'expired' | 'on_hold' | 'paused' | 'refunded' | 'ended' | string
  provider?: string | null
  manageUrl?: string | null
  endedAt?: string | null
  branchesLockAt?: string | null
  inGrace?: boolean
  remainingDays?: number | null
}

export const hostBillingApi = {
  // GET /host/subscription/current — the SAME endpoint the mobile app's
  // MySubscriptionScreen reads. Whatever this returns (IAP or legacy
  // manual) is this tenant's one real entitlement; there is deliberately no
  // separate CMS-specific "get my plan" endpoint. 404s when there never was one;
  // a plan that ended answers 200 with `entitled: false` and `lapse` (P7c, R-82).
  getCurrentSubscription: async (): Promise<ApiResponse<TenantSubscription>> => {
    const { data } = await apiClient.get('/host/subscription/current')
    return data
  },

  // GET /host/branch-quota — activeBranches/maxBranches/buildableBranches,
  // the same numbers the app's capacity banner reads.
  getBranchQuota: async (): Promise<ApiResponse<{ maxBranches: number; activeBranches: number; usedBranches: number; buildableBranches: number; remainingBranches: number }>> => {
    const { data } = await apiClient.get('/host/branch-quota')
    return data
  },

  // GET /billing/plans — the real branch-count catalog, shown here as
  // reference pricing only (purchasing itself happens in the mobile app for
  // IOS/ANDROID; there is no web checkout yet).
  getBankInstructions: async (): Promise<ApiResponse<BankTransferInstructions>> => {
    const { data } = await apiClient.get('/billing/bank-instructions')
    return data
  },

  getCatalog: async (): Promise<ApiResponse<{ plans: CatalogPlan[] } | CatalogPlan[]>> => {
    const { data } = await apiClient.get('/billing/plans')
    return data
  },
}

// ── P9c item D (R-95): paying for a GymsEra plan by bank transfer ───────────────
export type PlanPaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type PlanPaymentCycle = 'MONTHLY' | 'YEARLY'

export interface PlanPaymentRequest {
  id: string
  tenantId: string
  billingPlanId: string
  branchCount: number
  billingCycle: PlanPaymentCycle
  amount: string
  currency: string
  method: string
  status: PlanPaymentStatus
  hasProof: boolean
  payerReference?: string | null
  rejectionReason?: string | null
  reviewedAt?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  createdAt: string
  tenantName?: string | null
}

/** The server's own terms per cycle: the CMS never computes a duration or a price. */
export interface PlanPaymentCycleTerms {
  cycle: PlanPaymentCycle
  months: number
  amount: number
  currency: string
}

export interface PlanPaymentOverview {
  plans: Array<{ id: string; branchCount: number; currency: string; cycles: PlanPaymentCycleTerms[] }>
  methods: Array<{ key: string; label: string; requiresProof: boolean; available: boolean; instructions: BankTransferInstructions | null }>
  requests: PlanPaymentRequest[]
  pending: PlanPaymentRequest | null
  blocked: { code: string; platform: string; manageUrl?: string | null; message: string } | null
  canSubmit: boolean
}

export const planPaymentsApi = {
  getOverview: async (): Promise<ApiResponse<PlanPaymentOverview>> => {
    const { data } = await apiClient.get('/host/plan-payments')
    return data
  },

  /** Only the plan, the cycle and the receipt are sent; the server prices it from the catalog. */
  submit: async (input: { billingPlanId: string; billingCycle: PlanPaymentCycle; proof: File; payerReference?: string }): Promise<ApiResponse<{ request: PlanPaymentRequest }>> => {
    const form = new FormData()
    form.append('billingPlanId', input.billingPlanId)
    form.append('billingCycle', input.billingCycle)
    form.append('method', 'BANK_TRANSFER')
    if (input.payerReference) form.append('payerReference', input.payerReference)
    form.append('proof', input.proof)
    const { data } = await apiClient.post('/host/plan-payments', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return data
  },
}
