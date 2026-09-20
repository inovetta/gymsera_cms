import apiClient from './client'
import { ApiResponse, BillingPlan } from '@/types'

export interface CreateBillingPlanPayload {
  branchCount: number
  monthlyPrice: number
  annualPrice: number
  currency?: string
  isActive?: boolean
  sortOrder?: number
  iosMonthlyProductId?: string
  iosAnnualProductId?: string
  androidProductId?: string
  androidMonthlyBasePlanId?: string
  androidAnnualBasePlanId?: string
}

export type UpdateBillingPlanPayload = Partial<CreateBillingPlanPayload>

export const billingPlansApi = {
  getPlans: async (): Promise<ApiResponse<BillingPlan[]>> => {
    const { data } = await apiClient.get('/admin/billing-plans')
    return data
  },

  getPlan: async (id: string): Promise<ApiResponse<BillingPlan>> => {
    const { data } = await apiClient.get(`/admin/billing-plans/${id}`)
    return data
  },

  createPlan: async (payload: CreateBillingPlanPayload): Promise<ApiResponse<BillingPlan>> => {
    const { data } = await apiClient.post('/admin/billing-plans', payload)
    return data
  },

  // Editing monthlyPrice/annualPrice touches only GymsEra's own catalog
  // price — never a provider's live configuration, never an existing
  // subscriber's already-locked-in price. Flips every provider's sync
  // status to PENDING so it's visible they may now be stale.
  updatePlan: async (id: string, payload: UpdateBillingPlanPayload): Promise<ApiResponse<BillingPlan>> => {
    const { data } = await apiClient.patch(`/admin/billing-plans/${id}`, payload)
    return data
  },

  // The one automated provider-sync action — creates a NEW Stripe Price at
  // the catalog's current amount (Prices are immutable) and repoints this
  // plan at it. Existing Stripe subscribers keep referencing their original
  // Price automatically.
  syncStripe: async (id: string): Promise<ApiResponse<BillingPlan>> => {
    const { data } = await apiClient.post(`/admin/billing-plans/${id}/sync-stripe`)
    return data
  },

  // iOS/Android have no safe price-write API — this just records that the
  // admin has updated App Store Connect / Play Console by hand.
  markSynced: async (id: string, provider: 'ios' | 'android'): Promise<ApiResponse<BillingPlan>> => {
    const { data } = await apiClient.post(`/admin/billing-plans/${id}/mark-synced`, { provider })
    return data
  },
}
