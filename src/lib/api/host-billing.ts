import apiClient from './client'
import { ApiResponse, TenantSubscription } from '@/types'

// The same branch-count catalog row shape gyms_era's billing_plan.dart
// consumes — see billing.controller.js#getPlans. Public/unauthenticated on
// the backend (no product IDs a browser shouldn't see are exposed without
// ?platform=), but calling it from an authenticated CMS session is fine.
export interface CatalogPlan {
  id: string
  branchCount: number
  monthlyPrice: number
  annualPrice: number
  currency: string
}

export const hostBillingApi = {
  // GET /host/subscription/current — the SAME endpoint the mobile app's
  // MySubscriptionScreen reads. Whatever this returns (IAP or legacy
  // manual) is this tenant's one real entitlement; there is deliberately no
  // separate CMS-specific "get my plan" endpoint. 404s when there is none.
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
  getCatalog: async (): Promise<ApiResponse<{ plans: CatalogPlan[] }>> => {
    const { data } = await apiClient.get('/billing/plans')
    return data
  },

  // POST /host/subscription/upgrade — the manual/invoice path (bank
  // transfer), NOT the IAP purchase flow. host.controller.js#upgradeSubscription
  // itself refuses this with 409 iap_subscription_active if the tenant
  // already has a store-verified subscription, so this only ever succeeds
  // for a tenant with no real (IAP) plan — which is also the only state
  // this screen shows the option in.
  requestManualPlan: async (planId: string): Promise<ApiResponse<TenantSubscription>> => {
    const { data } = await apiClient.post('/host/subscription/upgrade', { planId })
    return data
  },
}
