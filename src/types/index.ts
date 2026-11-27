export type UserRole = 'MEMBER' | 'TRAINER' | 'BRANCH_MANAGER' | 'GYM_HOST' | 'PLATFORM_ADMIN'
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED'
export type OrganizationStatus = 'DRAFT' | 'PENDING_REVIEW' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ACTIVE' | 'PENDING_DELETION' | 'DELETED'
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED'
export type PaymentStatus = 'PENDING' | 'STAFF_COLLECTED' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'EXPIRED'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'WALLET' | 'ONLINE' | 'POS'
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'CANCELLED' | 'OVERDUE'
export type PlanDurationType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type GenderType = 'MALE' | 'FEMALE' | 'MIXED'
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export interface User {
  id: string
  fullName: string
  email: string
  phone?: string
  role: UserRole
  status: UserStatus
  isVerified: boolean
  profileImageUrl?: string
  lastLoginAt?: string
  createdAt: string
}

/**
 * NEW-244: the plan status a host sees for a member, the app's member-list badge
 * (server rule: gymsera_be utils/membership-status.utils.js).
 */
export type MembershipDisplayStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'FROZEN' | 'PENDING'

/** A row of GET /organizations/me/members: the account (`status`) plus the subscription that speaks for it. */
export interface OrganizationMember extends Omit<User, 'role' | 'isVerified'> {
  role?: UserRole
  isVerified?: boolean
  membershipStatus?: MembershipDisplayStatus
  subscriptionStatus?: SubscriptionStatus
  planName?: string | null
  endDate?: string | null
  branchName?: string | null
}

/** R-84 (NEW-158): a photo the approval would publish (GET /admin/organizations/:organizationId). */
export interface ApprovalPhoto {
  url: string
  kind: 'logo' | 'cover' | 'gallery'
  branchId?: string
}

/** Contract v2 §3 "Organization": the host's company (was `tenants`). */
export interface Organization {
  approvalPhotos?: ApprovalPhoto[]
  id: string
  /** Short human code (contract v2: was `tenantCode`; new codes start `ORG-`). */
  organizationCode?: string
  /** The organization's own name, private to the host and GymsEra (was `businessName`). */
  organizationName: string
  ownerUserId?: string
  email: string
  phone: string
  cityId: number
  status: OrganizationStatus
  selectedPackageId?: string
  /** Become a Host draft of the first business (was `gymName` / `gymDescription`). */
  firstBusinessName?: string
  firstBusinessDescription?: string
  genderType?: GenderType
  logoUrl?: string
  coverImageUrl?: string
  kycStatus?: string
  kycDocumentsJson?: string[]
  rejectionReason?: string
  onboardingStep?: number
  createdAt: string
  owner?: User
  user?: User
  city?: City
  selectedPackage?: PlatformPackage
  /** The organization's businesses on GET /admin/organizations/:organizationId (G2, owner decision 2026-11-22). */
  businesses?: OrganizationBusiness[]
  // Resumable provisioning (FLOW-02), from GET /admin/organizations/:organizationId and approve.
  provisioning?: OrganizationProvisioning
}

// The six provisioning steps, in order (backend tenant-provisioning.service.js).
export type ProvisioningState =
  | 'REQUESTED'
  | 'DB_CREATED'
  | 'MODELS_SYNCED'
  | 'LISTING_CREATED'
  | 'BRANCH_CREATED'
  | 'SUBSCRIPTION_LINKED'
  | 'ACTIVE'

export interface OrganizationProvisioning {
  state: ProvisioningState | null // null: provisioned (or approved) before FLOW-02
  step: number // finished steps, 0..totalSteps
  totalSteps: number
  inProgress: boolean // another run holds the lock right now
  lockedUntil: string | null
  lastError: string | null
  canResume: boolean
}

/** One business of an organization in the admin detail (contract v2 Business keys). */
export interface OrganizationBusiness {
  id: string
  name: string
  status: string
  activeBranches?: number
  branchCount?: number
  reservedSlots?: number
  kycStatus?: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED'
  businessVerified?: boolean
  averageRating?: number | string
  isFeatured?: boolean
  createdAt?: string
}

/** Contract v2 §3 "OrganizationSubscription": the organization's GymsEra plan. */
export interface OrganizationSubscription {
  id: string
  organizationId: string
  // Nullable now: only the legacy manual/PlatformPackage path (bank
  // transfer / sales-assisted) sets this. A real store-verified purchase
  // sets branchCount/platform below instead.
  platformPackageId: string | null
  billingPlanId: string | null
  // MANUAL is every legacy row (bank transfer / admin-assigned). A real
  // purchase sets this to where it was actually made.
  platform: 'MANUAL' | 'IOS' | 'ANDROID' | 'STRIPE'
  // Snapshotted at purchase time — this, not platformPackageId/package, is
  // what actually governs branch capacity for a store-verified tenant.
  branchCount: number | null
  productId?: string | null
  externalOriginalTransactionId?: string | null
  environment?: 'SANDBOX' | 'PRODUCTION' | null
  startDate: string
  endDate: string
  /** The currency the plan was charged in (p004; a store row in the store's currency, BUG-10). */
  currency?: string | null
  amount: number
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  // PENDING_MIGRATION/PENDING_CANCEL/SCHEDULED are real transitional states
  // a cross-platform migration leaves behind — see
  // subscription-migration.service.js. Never flatten these to ACTIVE.
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PENDING_MIGRATION' | 'PENDING_CANCEL' | 'SCHEDULED'
  autoRenew: boolean
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED'
  bankTransferRef?: string | null
  overQuotaCount?: number
  statusNote?: string | null
  package?: PlatformPackage
  createdAt: string
}

export interface City {
  id: number
  name: string
  isActive: boolean
  imageUrl?: string | null
  createdAt: string
  areas?: Area[]
  /** NEW-261: number of areas, from GET /cities (shown before the city is opened). */
  areaCount?: number
}

export interface Area {
  id: number
  cityId: number
  name: string
  imageUrl?: string | null
}

/** Contract v2 §3 "BusinessProfile": the staff view of one business (`/organizations/me/businesses/:businessId/profile`). */
export interface BusinessProfile {
  id: string
  name: string
  description?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  website?: string | null
  genderType: GenderType | string
  logoUrl?: string | null
  coverImageUrl?: string | null
  socialLinksJson?: Record<string, string> | null
  imagesJson?: string[] | null
  createdAt: string
  updatedAt?: string
}

/** A business as other objects embed it (reviews, admin overview). */
export interface BusinessSummary {
  id: string
  organizationId: string
  name: string
  description?: string
  latitude?: number
  longitude?: number
  averageRating: number
  totalReviews?: number
  logoUrl?: string
  coverImageUrl?: string
  genderType: GenderType
  status: string
  featured: boolean
  isFeatured?: boolean
}

export interface Branch {
  /** NEW-265: the branch's own area request while pending or refused (A4 reads). */
  pendingArea?: import('@/lib/api/area-requests').PendingArea | null
  id: string
  /** The business this branch belongs to (contract v2: was `gymId`; `gymListingId` is removed). */
  businessId: string
  branchName: string
  address: string
  cityId: number
  areaId?: number
  latitude?: number
  longitude?: number
  phone?: string
  openingTime?: string
  closingTime?: string
  facilities: string[]
  facilitiesJson: string[]
  images: string[]
  imagesJson: string[]
  status: string
  city?: City
  area?: Area
  /** GLB-02: the currency the branch sells in. */
  currency?: string | null
  /** NEW-140: the Google place the address was picked from. */
  googlePlaceId?: string | null
  /** P5b (R-81): set while the host has paused the branch (hidden from travellers). */
  pausedAt?: string | null
  /** R-82: locked for billing (over the plan's limit, or the plan ended), and why. */
  billingLockedAt?: string | null
  billingLockReason?: string | null
  /** pending = in review, active = visible, deactivated = hidden by GymsEra. */
  travelerVisibilityStatus?: string | null
  deactivationReason?: string | null
  /** D12: the branch's own refund policy (contract v2 §3 Branch). */
  refundsAllowed?: boolean
  refundWindowDays?: number | null
}

export interface MembershipPlan {
  id: string
  businessId: string
  branchId?: string
  name: string
  description?: string
  durationType: PlanDurationType
  durationValue: number
  price: number
  joiningFee: number
  securityFee: number
  visitLimit?: number
  freezeLimitDays: number
  isTrial: boolean
  status: string
  /** Shown to travellers (POST /membership-plans/:id/public toggles it). */
  isPublic?: boolean
  isDeactivated?: boolean
  /** BUG-09 / R-80: the currency the plan sells in (its branch's, or the first branch's). */
  currency?: string
  posterUrl?: string
  branch?: Branch
}

export interface MemberSubscription {
  id: string
  /** BUG-31: who created it (MEMBER = a request that starts on approval) and a scheduled plan change. */
  createdByRole?: string | null
  pendingPlanId?: string | null
  pendingPlan?: { id?: string; name?: string | null } | null
  pendingChangeEffectiveDate?: string | null
  userId: string
  branchId: string
  membershipPlanId: string
  startDate: string
  endDate: string
  status: SubscriptionStatus
  autoRenew: boolean
  qrCode?: string
  remainingVisits?: number
  freezeFrom?: string
  freezeTo?: string
  sourceChannel?: string
  subscribedAt?: string
  cancelledAt?: string
  createdAt?: string
  user?: User
  branch?: Branch
  plan?: MembershipPlan
  membershipPlan?: MembershipPlan
  latestPayment?: Payment | null
}

export interface AttendanceLog {
  id: string
  userId: string
  branchId: string
  subscriptionId?: string
  checkInTime: string
  checkOutTime?: string
  user?: User
  branch?: Branch
}

export interface Payment {
  id: string
  userId: string
  paymentFor: string
  referenceEntityId?: string
  branchId?: string
  amount: number
  currency: string
  method: PaymentMethod
  status: PaymentStatus
  /** P9c (A): the authenticated proof route (`/api/v1/payments/<id>/proof`), never a public URL. */
  proofUrl?: string | null
  /** P9c (A): a proof was sent before uploads were stored; the file does not exist. */
  proofMissing?: boolean
  notes?: string
  rejectedReason?: string
  createdBy?: string
  createdByRole?: string
  staffCollectedBy?: string
  collectedAt?: string
  verifiedBy?: string
  verifiedAt?: string
  paidAt?: string
  createdAt: string
  user?: User
  branch?: Branch
}

export interface Invoice {
  id: string
  userId: string
  invoiceNo: string
  invoiceType: string
  referenceEntityId?: string
  subtotal: number
  discountAmount?: number
  taxAmount?: number
  totalAmount: number
  status: InvoiceStatus
  dueDate?: string
  paidAt?: string
  createdAt: string
  user?: User
}

export interface Trainer {
  id: string
  userId: string
  specialization: string
  bio?: string
  yearsExperience: number
  certifications: string[]
  status: string
  user?: User
}

export interface BranchStaff {
  id: string
  userId: string
  branchId: string
  designation: string
  employmentStatus?: string
  user?: User
  branch?: Branch
}

export interface BranchReport {
  branch: { id: string; name: string; status: string }
  members: { active: number; frozen: number; pending: number; expiredThisMonth: number }
  revenue: { allTime: number; thisMonth: number; pendingCount: number; staffCollectedCount: number }
  attendance: { checkInsToday: number; checkInsThisMonth: number }
  staff: { active: number }
  planDistribution: { planId: string; planName: string; count: number }[]
  revenueByDay: { day: string; totalRevenue: string; count: string }[]
}

export interface BusinessReview {
  id: string
  businessId: string
  userId: string
  rating: number
  title: string
  body: string
  status: ReviewStatus
  createdAt: string
  user?: User
  /** GET /admin/reviews: the reviewer and the business reviewed (contract v2: `gym { title }` → `business { name }`). */
  reviewer?: Pick<User, 'id' | 'fullName' | 'email'>
  business?: { id: string; name: string | null }
  /** The business name by the traveller rule (G7: was `gymTitle`). */
  businessName?: string | null
}

export interface PlatformPackage {
  id: string
  name: string
  description?: string
  price: number
  billingCycle: BillingCycle
  maxBusinesses: number
  maxBranches: number
  maxTrainers: number
  maxMembers: number
  featureFlags: Record<string, boolean>
  status: string
}

// The central GymsEra plan catalog — branch-count tiers with a monthly/
// annual PKR price, consumed unchanged by iOS, Android, the website, and
// the in-app Host Area. Deliberately a separate catalog from PlatformPackage
// above.
export type ProviderSyncStatus = 'SYNCED' | 'PENDING' | 'MISMATCH' | 'NOT_CONFIGURED'

export interface BillingPlan {
  id: string
  branchCount: number
  monthlyPrice: number
  annualPrice: number
  currency: string
  isActive: boolean
  sortOrder: number
  iosMonthlyProductId?: string | null
  iosAnnualProductId?: string | null
  androidProductId?: string | null
  androidMonthlyBasePlanId?: string | null
  androidAnnualBasePlanId?: string | null
  stripeProductId?: string | null
  stripeMonthlyPriceId?: string | null
  stripeAnnualPriceId?: string | null
  iosSyncStatus: ProviderSyncStatus
  androidSyncStatus: ProviderSyncStatus
  stripeSyncStatus: ProviderSyncStatus
  iosLastSyncedAt?: string | null
  androidLastSyncedAt?: string | null
  stripeLastSyncedAt?: string | null
  /** BILL-15: what the daily read-only store check found. Absent on responses from an older API. */
  priceVerification?: PriceVerification
}

/** VERIFIED: the store holds the catalog price (checked within 48 h). MISMATCH: it does not.
 * ADMIN_ATTESTED: nothing has proved it; the admin says it matches (no check yet, product not in the store, old check, or iOS). */
export type PriceVerificationStatus = 'VERIFIED' | 'MISMATCH' | 'ADMIN_ATTESTED'

export interface PriceVerification {
  android: { status: PriceVerificationStatus; checkedAt: string | null; mismatchCount?: number }
  ios: { status: PriceVerificationStatus; checkedAt: string | null }
}

export interface DashboardStats {
  totalMembers: number
  activeSubscriptions: number
  monthlyRevenue: number
  todayAttendance: number
  newMembersThisMonth: number
  revenueGrowth: number
  attendanceGrowth: number
}

export interface PlatformStats {
  totalTenants: number
  activeTenants: number
  pendingApprovals: number
  suspendedTenants: number
  totalMembers: number
  activeSubscriptions: number
  expiredSubscriptions: number
  expiringInTwoDays: number
  totalRevenue: number
}

export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
  pagination?: Pagination
}

export interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
}
