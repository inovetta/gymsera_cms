import apiClient from './client'
import { fetchPrivateFile } from './private-file'
import { ApiResponse, Organization, OrganizationProvisioning, BusinessReview, PlatformStats } from '@/types'
import type { Business } from './host'

/** Contract v2 §3 OrganizationSubscription, as the admin Subscription tab reads it. */
export interface AdminOrganizationSubscription {
  id: string
  organizationId: string
  platformPackageId: string | null
  billingPlanId?: string | null
  // MANUAL is the legacy/bank-transfer path (platformPackageId set, package
  // below populated). IOS/ANDROID/STRIPE are store-verified — branchCount is
  // the real entitlement, package is deliberately null (the two catalogs are kept separate).
  platform?: 'MANUAL' | 'IOS' | 'ANDROID' | 'STRIPE'
  /** A store test purchase is SANDBOX (R-87, R-114): never live for travellers. */
  environment?: 'SANDBOX' | 'PRODUCTION' | null
  branchCount?: number | null
  startDate: string
  endDate: string
  currency?: string | null
  amount: number
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  // GRACE on a MANUAL row is a pay-later plan waiting for the bank transfer; endDate is the pay-by date (BILL-13, R-17).
  // PENDING_MIGRATION/PENDING_CANCEL/SCHEDULED are transitional states from
  // a cross-provider migration (subscription-migration.service.js) —
  // PENDING_CANCEL means the host needs to cancel this one themselves
  // (Apple/Google, no server-side cancel API); SCHEDULED means GymsEra
  // already scheduled its cancellation with Stripe.
  status: 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELLED' | 'PENDING_MIGRATION' | 'PENDING_CANCEL' | 'SCHEDULED'
  statusNote?: string | null
  autoRenew: boolean
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED'
  overQuotaCount?: number
  externalOriginalTransactionId?: string | null
  createdAt: string
  package?: { id: string; name: string; price: number; billingCycle: string; maxBusinesses: number; maxBranches: number; maxTrainers: number; maxMembers: number }
}

export interface PlatformInvoice {
  id: string
  organizationId: string
  organizationSubscriptionId: string | null
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
  organizationSubscriptionId?: string
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

// subscription-quota.service.js#auditCapacity: read-only, reports drift, never repairs.
// Contract v2 §2 renames applied (listingId → businessId, title → name, businessName → organizationName).
export interface CapacityAuditBusiness {
  businessId: string
  name: string
  actualReservedSlots: number
  ledgerReservedSlots: number
  drift: number
}

export interface CapacityAudit {
  organizationId: string
  organizationName: string
  maxBranches: number
  activeBranches: number | null
  usedCapacity: number | null
  invariantHolds: boolean | null
  recordedOverQuota: number
  expectedOverQuota: number | null
  overQuotaMismatch: boolean
  businesses: CapacityAuditBusiness[]
  driftedBusinesses: CapacityAuditBusiness[]
  totalDrift: number
  ok: boolean
}

export interface AdminBranch {
  /** NEW-265 (R-109 F7): the area request this record waits on, pending or refused. */
  pendingArea?: import('./area-requests').PendingArea | null
  id: string
  /** The business the branch belongs to (contract v2 §3 Branch; groups the admin branch list). */
  businessId: string
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
  /** P5b pause and R-82 billing lock. */
  pausedAt?: string | null
  billingLockedAt?: string | null
  billingLockReason?: string | null
  createdAt: string
  business?: { id: string; name: string }
}

export interface OrganizationMemberRow {
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
    /** True while email and phone are masked (SEC-17); the full values come from revealMemberContact. */
    contactMasked?: boolean
    status: string
    profileImageUrl: string | null
  }
}

export interface OrganizationPlan {
  id: string
  businessId: string
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
  /** R-80: the plan's currency and traveller visibility, as the API sends them. */
  currency?: string | null
  isPublic?: boolean
  isDeactivated?: boolean
}

export interface GetOrganizationsParams {
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
  businessId?: string
}

export interface CreateOrganizationPayload {
  ownerEmail: string
  ownerFullName: string
  ownerPhone?: string
  organizationName: string
  email: string
  phone?: string
  cityId?: number
  packageId?: string
}

// ── Business (admin) ──────────────────────────────────────────────────────────
/** Contract v2 §3 Business, as GET /admin/businesses/:businessId sends it. */
export interface AdminBusiness extends Omit<Business, 'facilitiesJson' | 'cityId' | 'areaId'> {
  /** NEW-265 (R-109 F7): the area request this record waits on, pending or refused. */
  pendingArea?: import('./area-requests').PendingArea | null
  organizationId: string
  cityId?: number
  areaId?: number
  name: string
  description?: string | null
  logoUrl?: string | null
  coverImageUrl?: string | null
  genderType: string
  averageRating: string
  isFeatured: boolean
  contactPhone?: string | null
  website?: string | null
  facilitiesJson?: Record<string, boolean>
  imagesJson?: string[] | null
  status: string
  latitude?: string | null
  longitude?: string | null
  city?: { id: number; name: string }
  area?: { id: number; name: string }
}

export interface UpdateBusinessPayload {
  name?: string
  description?: string
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

export interface CreateBusinessPayload {
  name: string
  description?: string
  genderType: string
  contactPhone?: string
  website?: string
  cityId?: number
  areaId?: number
  latitude?: number
  longitude?: number
}

export interface CreateAdminBranchPayload {
  /** The business the branch is added to; it must be approved (409 business_not_approved). */
  businessId: string
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
  /** NEW-140: the Google place the address was picked from (through /places). */
  googlePlaceId?: string
}

export interface UpdateAdminBranchPayload {
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
  googlePlaceId?: string | null
  status?: 'ACTIVE' | 'INACTIVE'
}

// OBS-05: GET /admin/billing-events, the webhook / store notification inbox. The server never returns
// the raw provider payload, and neither does this type.
export type BillingEventStatus = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED'
export type BillingEventProvider = 'APPLE' | 'GOOGLE' | 'STRIPE'

export interface BillingEvent {
  id: string
  provider: BillingEventProvider
  providerEventId: string
  eventType: string | null
  status: BillingEventStatus
  attempts: number
  /** Already redacted by the server. For an IGNORED event it is the reason. */
  lastError: string | null
  organizationId: string | null
  organizationName: string | null
  receivedAt: string
  processedAt: string | null
  /** RECEIVED for over 10 minutes, or FAILED at 5 attempts or more: the cases that raise a platform alert. */
  stuck: boolean
}

export interface GetBillingEventsParams {
  /** An organization id, or 'none' for events not matched to any organization. */
  organizationId?: string
  status?: BillingEventStatus
  provider?: BillingEventProvider
  page?: number
  limit?: number
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } }

export const adminApi = {
  createOrganization: async (payload: CreateOrganizationPayload): Promise<ApiResponse<{ organization: Organization }>> => {
    const { data } = await apiClient.post('/admin/organizations', payload)
    return data
  },

  getBillingEvents: async (params?: GetBillingEventsParams): Promise<ApiResponse<BillingEvent[]>> => {
    const { data } = await apiClient.get('/admin/billing-events', { params })
    return data
  },

  getOrganizations: async (params?: GetOrganizationsParams): Promise<ApiResponse<{ organizations: Organization[]; page?: number; total?: number }>> => {
    const { data } = await apiClient.get('/admin/organizations', { params })
    return data
  },

  /** The approval queue: one row per organization (first time) and per business (G1). */
  getReviewQueue: async (params?: { page?: number; limit?: number; kind?: ReviewQueueKind }): Promise<ApiResponse<{ items: ReviewQueueItem[]; page?: number; total?: number }>> => {
    const { data } = await apiClient.get('/admin/review-queue', { params })
    return data
  },

  getOrganization: async (organizationId: string): Promise<ApiResponse<{ organization: Organization }>> => {
    const { data } = await apiClient.get(`/admin/organizations/${organizationId}`)
    return data
  },

  // Approve, or Resume a provisioning that stopped (FLOW-02). One idempotency
  // key per click: a repeated request replays the first answer. 202 = another
  // run is provisioning this organization (data.provisioning.inProgress).
  // R-84 (NEW-158): the API refuses an approval without the admin's photo check (photosChecked: true).
  approveOrganization: async (
    organizationId: string,
    idempotencyKey: string,
    body: { photosChecked: true }
  ): Promise<ApiResponse<{ organization: Organization; provisioning: OrganizationProvisioning }>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/approve`, body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  // R-84: takes one photo off an application before approval (audited by the API).
  removeApprovalPhoto: async (organizationId: string, imageUrl: string): Promise<ApiResponse<{ removedFrom: string }>> => {
    const { data } = await apiClient.delete(`/admin/organizations/${organizationId}/approval-photos`, { data: { imageUrl } })
    return data
  },

  rejectOrganization: async (organizationId: string, reason: string): Promise<ApiResponse<Organization>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/reject`, { reason })
    return data
  },

  suspendOrganization: async (organizationId: string, reason: string): Promise<ApiResponse<Organization>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/suspend`, { reason })
    return data
  },

  reactivateOrganization: async (organizationId: string): Promise<ApiResponse<Organization>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/reactivate`)
    return data
  },

  getOrganizationBranches: async (organizationId: string): Promise<ApiResponse<{ branches: AdminBranch[] }>> => {
    const { data } = await apiClient.get(`/admin/organizations/${organizationId}/branches`)
    return data
  },

  // Read-only integrity report (subscription-quota.service.js#auditCapacity). Reports drift between
  // each business's reserved slots and the capacity_events ledger, and whether overQuotaCount matches
  // real overage. Never repairs anything itself.
  getCapacityAudit: async (organizationId: string): Promise<ApiResponse<{ audit: CapacityAudit }>> => {
    const { data } = await apiClient.get(`/admin/organizations/${organizationId}/capacity-audit`)
    return data
  },

  updateBranchStatus: async (organizationId: string, branchId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<ApiResponse<{ branch: AdminBranch }>> => {
    const { data } = await apiClient.patch(`/admin/organizations/${organizationId}/branches/${branchId}/status`, { status })
    return data
  },

  getOrganizationMembers: async (organizationId: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<{ members: OrganizationMemberRow[] }>> => {
    const { data } = await apiClient.get(`/admin/organizations/${organizationId}/members`, { params })
    return data
  },

  /** Full e-mail and phone of one member (SEC-17). Platform admins only; the server writes an audit row for every call. */
  revealMemberContact: async (
    organizationId: string,
    userId: string,
    reason?: string
  ): Promise<ApiResponse<{ userId: string; email: string; phone: string | null }>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/members/${userId}/reveal`, reason ? { reason } : {})
    return data
  },

  getOrganizationMembershipPlans: async (organizationId: string): Promise<ApiResponse<{ plans: OrganizationPlan[] }>> => {
    const { data } = await apiClient.get(`/admin/organizations/${organizationId}/membership-plans`)
    return data
  },

  getReviews: async (params?: GetReviewsParams): Promise<ApiResponse<{ reviews: BusinessReview[] }>> => {
    const { data } = await apiClient.get('/admin/reviews', { params })
    return data
  },

  moderateReview: async (id: string, action: 'APPROVE' | 'REJECT'): Promise<ApiResponse<BusinessReview>> => {
    // NEW-194: the API accepts only "approve" / "reject" (discovery.service.js moderateReview).
    const { data } = await apiClient.patch(`/admin/reviews/${id}/moderate`, { action: action.toLowerCase() })
    return data
  },

  deleteOrganization: async (organizationId: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/admin/organizations/${organizationId}`)
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

  // ── First-business draft images (Become a Host draft on the organization) ─────
  uploadFirstBusinessLogo: async (organizationId: string, file: File): Promise<ApiResponse<{ logoUrl: string }>> => {
    const formData = new FormData()
    formData.append('logo', file)
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/first-business/logo`, formData, multipart)
    return data
  },

  uploadFirstBusinessCover: async (organizationId: string, file: File): Promise<ApiResponse<{ coverImageUrl: string }>> => {
    const formData = new FormData()
    formData.append('cover', file)
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/first-business/cover`, formData, multipart)
    return data
  },

  // ── Organization subscriptions ─────────────────────────────────────────────────
  getSubscriptions: async (organizationId: string): Promise<ApiResponse<{ subscriptions: AdminOrganizationSubscription[] }>> => {
    const { data } = await apiClient.get(`/admin/organizations/${organizationId}/subscriptions`)
    return data
  },

  assignSubscription: async (organizationId: string, payload: AssignSubscriptionPayload): Promise<ApiResponse<{ subscription: AdminOrganizationSubscription; invoice: PlatformInvoice | null }>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/subscriptions`, payload)
    return data
  },

  revokeSubscription: async (organizationId: string, subId: string): Promise<ApiResponse<{ subscription: AdminOrganizationSubscription }>> => {
    const { data } = await apiClient.patch(`/admin/organizations/${organizationId}/subscriptions/${subId}/revoke`)
    return data
  },

  // Pay later (BILL-13, NEW-20): the admin confirms the bank transfer arrived; the GRACE plan becomes ACTIVE.
  verifyPayLaterPayment: async (organizationId: string, subId: string, bankTransferRef?: string): Promise<ApiResponse<{ subscription: AdminOrganizationSubscription }>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/subscriptions/${subId}/verify-payment`, bankTransferRef ? { bankTransferRef } : {})
    return data
  },

  // ── Organization invoices ──────────────────────────────────────────────────────
  getInvoices: async (organizationId: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<{ invoices: PlatformInvoice[] }>> => {
    const { data } = await apiClient.get(`/admin/organizations/${organizationId}/invoices`, { params })
    return data
  },

  createInvoice: async (organizationId: string, payload: CreateInvoicePayload): Promise<ApiResponse<{ invoice: PlatformInvoice }>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/invoices`, payload)
    return data
  },

  updateInvoice: async (organizationId: string, invoiceId: string, payload: UpdateInvoicePayload): Promise<ApiResponse<{ invoice: PlatformInvoice }>> => {
    const { data } = await apiClient.patch(`/admin/organizations/${organizationId}/invoices/${invoiceId}`, payload)
    return data
  },

  sendInvoiceReminder: async (organizationId: string, invoiceId: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/invoices/${invoiceId}/send-reminder`)
    return data
  },

  sendInvoiceConfirmation: async (organizationId: string, invoiceId: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/invoices/${invoiceId}/send-confirmation`)
    return data
  },

  // ── Businesses (one businessId, no compound ids: F7) ─────────────────────────
  getBusiness: async (businessId: string): Promise<ApiResponse<{ business: AdminBusiness }>> => {
    const { data } = await apiClient.get(`/admin/businesses/${businessId}`)
    return data
  },

  updateBusiness: async (businessId: string, payload: UpdateBusinessPayload): Promise<ApiResponse<{ business: AdminBusiness }>> => {
    const { data } = await apiClient.patch(`/admin/businesses/${businessId}`, payload)
    return data
  },

  createBusiness: async (organizationId: string, payload: CreateBusinessPayload): Promise<ApiResponse<{ business: AdminBusiness }>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/businesses`, payload)
    return data
  },

  uploadBusinessLogo: async (businessId: string, file: File): Promise<ApiResponse<{ logoUrl: string }>> => {
    const formData = new FormData()
    formData.append('logo', file)
    const { data } = await apiClient.post(`/admin/businesses/${businessId}/logo`, formData, multipart)
    return data
  },

  uploadBusinessCover: async (businessId: string, file: File): Promise<ApiResponse<{ coverImageUrl: string }>> => {
    const formData = new FormData()
    formData.append('cover', file)
    const { data } = await apiClient.post(`/admin/businesses/${businessId}/cover`, formData, multipart)
    return data
  },

  uploadBusinessImages: async (businessId: string, files: File[]): Promise<ApiResponse<{ images: string[] }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post(`/admin/businesses/${businessId}/images`, formData, multipart)
    return data
  },

  deleteBusinessImage: async (businessId: string, imageUrl: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/admin/businesses/${businessId}/images`, { data: { imageUrl } })
    return data
  },

  /** Approve one business (builds its held first branch); 422 `business_requirements_missing` with `data.missing`. */
  approveBusiness: async (businessId: string, idempotencyKey: string): Promise<ApiResponse<unknown>> => {
    const { data } = await apiClient.post(`/admin/businesses/${businessId}/approve`, undefined, {
      headers: { 'Idempotency-Key': idempotencyKey },
    })
    return data
  },

  rejectBusiness: async (businessId: string, reason: string): Promise<ApiResponse<unknown>> => {
    const { data } = await apiClient.post(`/admin/businesses/${businessId}/reject`, { reason })
    return data
  },

  /** Verified badge on (D11); 422 `registration_missing` without a registration document. */
  verifyBusiness: async (businessId: string): Promise<ApiResponse<unknown>> => {
    const { data } = await apiClient.post(`/admin/businesses/${businessId}/verify`)
    return data
  },

  /** The business's documents (G4): proof of premises, registration. */
  getBusinessDocuments: async (businessId: string): Promise<ApiResponse<KycDocument[]>> => {
    const { data } = await apiClient.get(`/admin/businesses/${businessId}/documents`)
    return data
  },

  approveBusinessDocument: async (businessId: string, documentId: string): Promise<ApiResponse<unknown>> => {
    const { data } = await apiClient.post(`/admin/businesses/${businessId}/documents/${documentId}/approve`)
    return data
  },

  rejectBusinessDocument: async (businessId: string, documentId: string, reason: string): Promise<ApiResponse<unknown>> => {
    const { data } = await apiClient.post(`/admin/businesses/${businessId}/documents/${documentId}/reject`, { reason })
    return data
  },

  /** Verified badge off (D11). */
  unverifyBusiness: async (businessId: string): Promise<ApiResponse<unknown>> => {
    const { data } = await apiClient.delete(`/admin/businesses/${businessId}/verify`)
    return data
  },

  // ── Admin branch management ───────────────────────────────────────────────────
  createBranch: async (organizationId: string, payload: CreateAdminBranchPayload): Promise<ApiResponse<{ branch: AdminBranch }>> => {
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/branches`, payload)
    return data
  },

  updateBranch: async (organizationId: string, branchId: string, payload: UpdateAdminBranchPayload): Promise<ApiResponse<{ branch: AdminBranch }>> => {
    const { data } = await apiClient.patch(`/admin/organizations/${organizationId}/branches/${branchId}`, payload)
    return data
  },

  uploadBranchImages: async (organizationId: string, branchId: string, files: File[]): Promise<ApiResponse<{ branch: AdminBranch }>> => {
    const formData = new FormData()
    files.forEach((f) => formData.append('images', f))
    const { data } = await apiClient.post(`/admin/organizations/${organizationId}/branches/${branchId}/images`, formData, multipart)
    return data
  },

  deleteBranchImage: async (organizationId: string, branchId: string, imageUrl: string): Promise<ApiResponse<null>> => {
    const { data } = await apiClient.delete(`/admin/organizations/${organizationId}/branches/${branchId}/images`, { data: { imageUrl } })
    return data
  },

  updateBranchTravelerVisibility: async (branchId: string, status: 'active' | 'deactivated', reason?: string): Promise<ApiResponse<{ branch: AdminBranch }>> => {
    const { data } = await apiClient.patch(`/admin/branches/${branchId}/traveler-visibility`, { status, reason })
    return data
  },

  getBranchVisibilityHistory: async (branchId: string): Promise<ApiResponse<{ history: Array<{ id: string; branchId: string; status: string; reason: string | null; changedBy: string | null; changedAt: string }> }>> => {
    const { data } = await apiClient.get(`/admin/branches/${branchId}/traveler-visibility/history`)
    return data
  },

  getOrganizationKycDocuments: async (organizationId: string): Promise<ApiResponse<KycDocument[]>> => {
    const { data } = await apiClient.get(`/organizations/${organizationId}/kyc-documents`)
    return data
  },

  // NEW-222: through fetchPrivateFile, which drops the `/api/v1` the API puts in streamUrl.
  downloadKycDocumentBlob: (streamUrl: string): Promise<Blob> => fetchPrivateFile(streamUrl),
}

export type ReviewQueueKind = 'ORGANIZATION' | 'BUSINESS'

/** One row of GET /admin/review-queue (G1, owner decision 2026-11-22). */
export interface ReviewQueueItem {
  kind: ReviewQueueKind
  organizationId: string
  businessId: string | null
  name: string
  status: string
  kycStatus: string | null
  submittedAt: string | null
}

export interface KycDocument {
  documentId: string
  originalName: string
  mimetype: string
  size: number
  documentType?: string
  /** Business documents: the admin's decision on this document (G4). */
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  uploadedAt: string
  streamUrl: string
}

