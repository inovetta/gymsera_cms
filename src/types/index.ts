export type UserRole = 'MEMBER' | 'TRAINER' | 'BRANCH_MANAGER' | 'GYM_HOST' | 'PLATFORM_ADMIN'
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
export type TenantStatus = 'PENDING_REVIEW' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ACTIVE'
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED'
export type PaymentStatus = 'PENDING' | 'STAFF_COLLECTED' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
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

export interface Tenant {
  id: string
  userId: string
  businessName: string
  email: string
  phone: string
  cityId: number
  status: TenantStatus
  selectedPackageId?: string
  gymName?: string
  gymDescription?: string
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
  gymListing?: GymListing
}

export interface TenantSubscription {
  id: string
  tenantId: string
  platformPackageId: string
  startDate: string
  endDate: string
  amount: number
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED'
  autoRenew: boolean
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED'
  bankTransferRef?: string | null
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
}

export interface Area {
  id: number
  cityId: number
  name: string
  imageUrl?: string | null
}

export interface Gym {
  id: string
  name: string
  description?: string
  logoUrl?: string
  coverImageUrl?: string
  imagesJson?: string[]
  genderType: GenderType
  status: string
  createdAt: string
  phone?: string
  email?: string
  address?: string
  latitude?: number | string
  longitude?: number | string
}

export interface GymListing {
  id: string
  tenantId: string
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
  id: string
  gymId: string
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
}

export interface MembershipPlan {
  id: string
  gymId: string
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
  posterUrl?: string
  branch?: Branch
}

export interface MemberSubscription {
  id: string
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
  proofUrl?: string
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

export interface GymStaff {
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

export interface GymReview {
  id: string
  gymListingId: string
  userId: string
  rating: number
  title: string
  body: string
  status: ReviewStatus
  createdAt: string
  user?: User
  gymListing?: GymListing
}

export interface PlatformPackage {
  id: string
  name: string
  description?: string
  price: number
  billingCycle: BillingCycle
  maxBranches: number
  maxTrainers: number
  maxMembers: number
  featureFlags: Record<string, boolean>
  status: string
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
