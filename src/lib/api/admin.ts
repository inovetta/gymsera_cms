import apiClient from './client'
import { ApiResponse, Tenant, GymReview, PlatformStats } from '@/types'

export interface TenantSubscription {
  id: string
  tenantId: string
  platformPackageId: string | null
  billingPlanId?: string | null
  // MANUAL is the legacy/bank-transfer path (platformPackageId set, package
  // below populated). IOS/ANDROID/STRIPE are store-verified — branchCount is
  // the real entitlement, package is deliberately null (see
  // TenantSubscription.model.js on the backend for why the two catalogs are
  // kept separate).
  platform?: 'MANUAL' | 'IOS' | 'ANDROID' | 'STRIPE'
  branchCount?: number | null
  startDate: string
  endDate: string
  amount: number
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  // PENDING_MIGRATION/PENDING_CANCEL/SCHEDULED are transitional states from
  // a cross-provider migration (subscription-migration.service.js) —
  // PENDING_CANCEL means the host needs to cancel this one themselves
  // (Apple/Google, no server-side cancel API); SCHEDULED means GymsEra
  // already scheduled its cancellation with Stripe.
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PENDING_MIGRATION' | 'PENDING_CANCEL' | 'SCHEDULED'
  statusNote?: string | null
  autoRenew: boolean
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED'
  overQuotaCount?: number
  externalOriginalTransactionId?: string | null
  createdAt: string
  package?: { id: string; name: string; price: number; billingCycle: string; maxOrganizations: number; maxBranches: number; maxTrainers: number; maxMembers: number }
}

export interface PlatformInvoice {
  id: string
  tenantId: string
  tenantSubscriptionId: string | null
  invoiceNo: string
  description: string | null
  subtotal: number
  taxAmount: number
  totalAmount: number
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  dueDate: string | null
  paidAt: string | null
  notes: string | null
  createdAt: string
  subscription?: { id: string; billingCycle: string; startDate: string; endDate: string; package?: { id: string; name: string } }
}

export interface AssignSubscriptionPayload {
  packageId: string
  startDate?: string
  billingCycle?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  amount?: number
  autoRenew?: boolean
  createInvoice?: boolean
}

export interface CreateInvoicePayload {
  tenantSubscriptionId?: string
  description?: string
  subtotal: number
  taxAmount?: number
  dueDate?: string
  notes?: string
  status?: 'DRAFT' | 'ISSUED'
}

export interface UpdateInvoicePayload {
  status?: 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  dueDate?: string
  notes?: string
  paidAt?: string
}

// Mirrors subscription-quota.service.js#auditCapacity's return shape
// exactly — read-only, reports drift, never repairs.
export interface CapacityAuditListing {
  listingId: string
  title: string
  actualReservedSlots: number
  ledgerReservedSlots: number
  drift: number
}

export interface CapacityAudit {
  tenantId: string
  businessName: string
  maxBranches: number
  activeBranches: number | null
  usedCapacity: number | null
  invariantHolds: boolean | null
  recordedOverQuota: number
  expectedOverQuota: number | null
  overQuotaMismatch: boolean
  listings: CapacityAuditListing[]
  driftedListings: CapacityAuditListing[]
  totalDrift: number
  ok: boolean
}

export interface TenantBranch {
  id: string
  gymId: string
  // Which organization this branch belongs to — used to group the flat
  // branch list by organization on the tenant detail page instead of
  // showing every branch across every organization as one undifferentiated
  // pile.
  gymListingId?: string
  branchName: string
  address: string | null
  cityId: number | null
  areaId: number | null
  phone: string | null
  status: 'ACTIVE' | 'INACTIVE'
  openingTime: string | null
  closingTime: string | null
  facilitiesJson: string[] | null
  latitude?: number | string | null
  longitude?: number | string | null
  travelerVisibilityStatus?: 'pending' | 'active' | 'deactivated'
  deactivationReason?: string | null
  deactivatedAt?: string | null
  deactivatedBy?: string | null
  createdAt: string
  gym?: { id: string; name: string }
}

export interface TenantMember {
  id: string
  userId: string
  branchId: string
  membershipPlanId: string
  startDate: string
  endDate: string
  status: string
  subscribedAt: string
  sourceChannel: string | null
  plan?: { id: string; name: string; durationType: string; durationValue: number }
  branch?: { id: string; branchName: string }
  user?: {
    id: string
    fullName: string
    email: string
    phone: string | null
    status: string
    profileImageUrl: string | null
  }
}

export interface TenantPlan {
  id: string
  gymId: string
  branchId: string | null
  name: string
  price: number
  durationType: string
  durationValue: number
  freezeLimitDays: number
  isTrial: boolean
  status: string
  description: string | null
  joiningFee: number
  createdAt: string
  branch?: { id: string; branchName: string }
}

export interface GetTenantsParams {
  page?: number
  limit?: number
  search?: string
  status?: string
  cityId?: number
}

export interface GetReviewsParams {
  page?: number
  limit?: number
  status?: string
  gymListingId?: string
}

export interface CreateTenantPayload {
  ownerEmail: string
  ownerFullName: string
  ownerPhone?: string
  businessName: string
  email: string
  phone?: string
  cityId?: number
  packageId?: string
}

// ── Gym listing ───────────────────────────────────────────────────────────────
export interface GymListingDetail {
  id: string
  tenantId: string
  cityId?: number
  areaId?: number
  title: string
  shortDescription?: string
  logoUrl?: string | null
  coverImageUrl?: string | null
  genderType: string
  averageRating: string
  isFeatured: boolean
  contactPhone?: string
  website?: string
  facilitiesJson?: Record<string, boolean>
  imagesJson?: string[]
  status: string
  latitude?: string | null
  longitude?: string | null
  city?: { id: number; name: string }
  area?: { id: number; name: string }
}

export interface UpdateGymListingPayload {
  title?: string
  shortDescription?: string
  genderType?: string
  contactPhone?: string
  website?: string
  facilitiesJson?: Record<string, boolean>
  isFeatured?: boolean
  status?: string
  latitude?: number | null
  longitude?: number | null
  cityId?: number
  areaId?: number | null
}

export interface CreateGymListingPayload {
  title: string
  shortDescription?: string
  genderType: string
  contactPhone?: string
  website?: string
  cityId?: number
  areaId?: number
  latitude?: number
  longitude?: number
}

export interface CreateTenantBranchPayload {
  branchName: string
  address: string
  cityId: number
  areaId?: number
  phone?: string
  openingTime?: string
  closingTime?: string
  facilities?: string[]
  latitude?: number
  longitude?: number
}

export interface UpdateTenantBranchPayload {
  branchName?: string
  address?: string
  cityId?: number
  areaId?: number | null
  phone?: string
  openingTime?: string
  closingTime?: string
  facilities?: string[]
  latitude?: number | null
  longitude?: number | null
  status?: 'ACTIVE' | 'INACTIVE'
}

export const adminApi = {
  createTenant: async (payload: CreateTenantPayload): Promise<ApiResponse<{ tenant: Tenant }>> => {
    const { data } = await apiClient.post('/admin/tenants', payload)
    return data
  },

  getTenants: async (params?: GetTenantsParams): Promise<ApiResponse<{ tenants: Tenant[] }>> => {
    const { data } = await apiClient.get('/admin/tenants', { params })
    return data
  },

  getTenant: async (id: string): Promise<ApiResponse<{ tenant: Tenant }>> => {
    const { data } = await apiClient.get(`/admin/tenants/${id}`)
    return data
  },

  approveTenant: async (id: string): Promise<ApiResponse<Tenant>> => {
    const { data } = await apiClient.post(`/admin/tenants/${id}/approve`)
    return data
  },

  rejectTenant: async (id: string, reason: string): Promise<ApiResponse<Tenant>> => {
    const { data } = await apiClient.post(`/admin/tenants/${id}/reject`, { reason })
    return data
  },

  suspendTenant: async (id: string, reason: string): Promise<ApiResponse<Tenant>> => {
    const { data } = await apiClient.post(`/admin/tenants/${id}/suspend`, { reason })
    return data
  },

  reactivateTenant: async (id: string): Promise<ApiResponse<Tenant>> => {
    const { data } = await apiClient.post(`/admin/tenants/${id}/reactivate`)
    return data
  },

  getTenantBranches: async (id: string): Promise<ApiResponse<{ branches: TenantBranch[] }>> => {
    const { data } = await apiClient.get(`/admin/tenants/${id}/branches`)
    return data
  },

  // Read-only integrity report — see subscription-quota.service.js#auditCapacity
  // on the backend. Reports drift between GymListing.reservedSlots and the
  // capacity_events ledger, and whether overQuotaCount matches real overage.
  // Never repairs anything itself.
  getTenantCapacityAudit: async (id: string): Promise<ApiResponse<{ audit: CapacityAudit }>> => {
    const { data } = await apiClient.get(`/admin/tenants/${id}/capacity-audit`)
    return data
  },

  updateTenantBranchStatus: async (tenantId: string, branchId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<ApiResponse<{ branch: TenantBranch }>> => {
    const { data } = await apiClient.patch(`/admin/tenants/${tenantId}/branches/${branchId}/status`, { status })
    return data
  },

  getTenantMembers: async (id: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<{ members: TenantMember[] }>> => {
    const { data } = await apiClient.get(`/admin/tenants/${id}/members`, { params })
    return data
  },

  getTenantMembershipPlans: async (id: string): Promise<ApiResponse<{ plans: TenantPlan[] }>> => {
    const { data } = await apiClient.get(`/admin/tenants/${id}/membership-plans`)
    return data
  },

  getReviews: async (params?: GetReviewsParams): Promise<ApiResponse<{ reviews: GymReview[] }>> => {
    const { data } = await apiClient.get('/admin/reviews', { params })
    return data
  },

  moderateReview: async (id: string, action: 'APPROVE' | 'REJECT'): Promise<ApiResponse<GymReview>> => {
    const { data } = await apiClient.patch(`/admin/reviews/${id}/moderate`, { action })
    return data
  },

  deleteTenant: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/admin/tenants/${id}`)
    return data
  },

  syncSubscriptions: async (): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post('/admin/subscriptions/sync')
    return data
  },

  getPlatformStats: async (): Promise<ApiResponse<PlatformStats>> => {
    const { data } = await apiClient.get('/admin/stats')
    return data
  },

  getPlatformAnalytics: async (period?: string): Promise<ApiResponse<{
    tenantGrowth: { month: string; tenants: number }[]
    memberGrowth: { month: string; members: number }[]
    monthlyRevenue: { month: string; revenue: number }[]
    cityDistribution: { city: string; tenants: number }[]
    year: number
  }>> => {
    const { data } = await apiClient.get('/admin/analytics', { params: { period } })
    return data
  },

  // ── Tenant image uploads ──────────────────────────────────────────────────────
  uploadTenantLogo: async (id: string, file: File): Promise<ApiResponse<{ logoUrl: string }>> => {
    const formData = new FormData()
    formData.append('logo', file)
    const { data } = await apiClient.post(`/admin/tenants/${id}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  uploadTenantCover: async (id: string, file: File): Promise<ApiResponse<{ coverImageUrl: string }>> => {
    const formData = new FormData()
    formData.append('cover', file)
    const { data } = await apiClient.post(`/admin/tenants/${id}/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  // ── Tenant subscriptions ──────────────────────────────────────────────────────
  getTenantSubscriptions: async (id: string): Promise<ApiResponse<{ subscriptions: TenantSubscription[] }>> => {
    const { data } = await apiClient.get(`/admin/tenants/${id}/subscriptions`)
    return data
  },

  assignTenantSubscription: async (id: string, payload: AssignSubscriptionPayload): Promise<ApiResponse<{ subscription: TenantSubscription; invoice: PlatformInvoice | null }>> => {
    const { data } = await apiClient.post(`/admin/tenants/${id}/subscriptions`, payload)
    return data
  },

  revokeTenantSubscription: async (id: string, subId: string): Promise<ApiResponse<{ subscription: TenantSubscription }>> => {
    const { data } = await apiClient.patch(`/admin/tenants/${id}/subscriptions/${subId}/revoke`)
    return data
  },

  // ── Tenant invoices ───────────────────────────────────────────────────────────
  getTenantInvoices: async (id: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<{ invoices: PlatformInvoice[] }>> => {
    const { data } = await apiClient.get(`/admin/tenants/${id}/invoices`, { params })
    return data
  },

  createTenantInvoice: async (id: string, payload: CreateInvoicePayload): Promise<ApiResponse<{ invoice: PlatformInvoice }>> => {
    const { data } = await apiClient.post(`/admin/tenants/${id}/invoices`, payload)
    return data
  },

  updateTenantInvoice: async (id: string, invoiceId: string, payload: UpdateInvoicePayload): Promise<ApiResponse<{ invoice: PlatformInvoice }>> => {
    const { data } = await apiClient.patch(`/admin/tenants/${id}/invoices/${invoiceId}`, payload)
    return data
  },

  sendInvoiceReminder: async (id: string, invoiceId: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post(`/admin/tenants/${id}/invoices/${invoiceId}/send-reminder`)
    return data
  },

  sendInvoiceConfirmation: async (id: string, invoiceId: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post(`/admin/tenants/${id}/invoices/${invoiceId}/send-confirmation`)
    return data
  },

  // ── Gym listing management ────────────────────────────────────────────────────
  getGymListing: async (tenantId: string): Promise<ApiResponse<{ gymListing: GymListingDetail }>> => {
    const { data } = await apiClient.get(`/admin/tenants/${tenantId}/gym-listing`)
    return data
  },

  updateGymListing: async (tenantId: string, payload: UpdateGymListingPayload): Promise<ApiResponse<{ gymListing: GymListingDetail }>> => {
    const { data } = await apiClient.patch(`/admin/tenants/${tenantId}/gym-listing`, payload)
    return data
  },

  createGymListing: async (tenantId: string, payload: CreateGymListingPayload): Promise<ApiResponse<{ gymListing: GymListingDetail }>> => {
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/gym-listing`, payload)
    return data
  },

  uploadGymListingLogo: async (tenantId: string, file: File): Promise<ApiResponse<{ logoUrl: string }>> => {
    const formData = new FormData()
    formData.append('logo', file)
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/gym-listing/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  uploadGymListingCover: async (tenantId: string, file: File): Promise<ApiResponse<{ coverImageUrl: string }>> => {
    const formData = new FormData()
    formData.append('cover', file)
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/gym-listing/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  uploadGymListingImages: async (tenantId: string, files: File[]): Promise<ApiResponse<{ images: string[] }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/gym-listing/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  deleteGymListingImage: async (tenantId: string, imageUrl: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/admin/tenants/${tenantId}/gym-listing/images`, { data: { imageUrl } })
    return data
  },

  // ── Admin branch management ───────────────────────────────────────────────────
  createTenantBranch: async (tenantId: string, payload: CreateTenantBranchPayload): Promise<ApiResponse<{ branch: TenantBranch }>> => {
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/branches`, payload)
    return data
  },

  updateTenantBranch: async (tenantId: string, branchId: string, payload: UpdateTenantBranchPayload): Promise<ApiResponse<{ branch: TenantBranch }>> => {
    const { data } = await apiClient.patch(`/admin/tenants/${tenantId}/branches/${branchId}`, payload)
    return data
  },

  uploadTenantBranchImages: async (tenantId: string, branchId: string, files: File[]): Promise<ApiResponse<{ branch: TenantBranch }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post(`/admin/tenants/${tenantId}/branches/${branchId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  deleteTenantBranchImage: async (tenantId: string, branchId: string, imageUrl: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/admin/tenants/${tenantId}/branches/${branchId}/images`, { data: { imageUrl } })
    return data
  },

  updateBranchTravelerVisibility: async (branchId: string, status: 'active' | 'deactivated', reason?: string): Promise<ApiResponse<{ branch: TenantBranch }>> => {
    const { data } = await apiClient.patch(`/admin/branches/${branchId}/traveler-visibility`, { status, reason })
    return data
  },

  getBranchVisibilityHistory: async (branchId: string): Promise<ApiResponse<{ history: Array<{ id: string; branchId: string; status: string; reason: string | null; changedBy: string | null; changedAt: string }> }>> => {
    const { data } = await apiClient.get(`/admin/branches/${branchId}/traveler-visibility/history`)
    return data
  },
}
