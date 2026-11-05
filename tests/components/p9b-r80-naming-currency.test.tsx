import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BillingPage from '@/app/(dashboard)/settings/billing/page'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { PlansTab } from '@/components/features/admin-tenant/plans-tab'
import { SubscriptionTab } from '@/components/features/admin-tenant/subscription-tab'
import { hostBillingApi, planPaymentsApi } from '@/lib/api/host-billing'
import { tenantsApi } from '@/lib/api/tenants'
import { adminApi } from '@/lib/api/admin'
import { packagesApi } from '@/lib/api/packages'
import { hostApi } from '@/lib/api/host'
import { gymApi } from '@/lib/api/gym'
import { citiesApi } from '@/lib/api/cities'
import { meApi } from '@/lib/api/me'
import { firstPlanPackage } from '@/lib/plans/plan-display'
import { ok } from '../fixtures/team'
import { PLAN_PAYMENT_OVERVIEW } from '../fixtures/plan-payments'
import { ownerContext } from '../fixtures/context'
import { fakePlaces, pickPlace } from '../fixtures/places'

/**
 * Phase 7 P9b, R-80 (CMS half) and BUG-24 (tier names on CMS screens).
 * Before: Subscription & Billing printed the locked plan amount with no currency (formatCurrency
 * defaults to PKR, so a USD 6.99 App Store plan read "Rs 7"), and named the plan by branch count or
 * by an admin-typed package name, never the tier the app shows ("Starter Plan"); the admin
 * Subscription tab showed the package name; the admin Plans tab printed "1 quarterly" and PKR for
 * every plan; the CMS first plan of a new branch or organization sent durationValue 12 for YEARLY and
 * 3 for QUARTERLY, which the API stores as 12 years and 9 months (business-date.utils.js addPlanDuration).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Hira Khan', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

// GET /billing/plans: the tier name comes from the API's one table (constants/plan-tiers.js).
const catalog = [
  { id: 'bp1', branchCount: 1, tierName: 'Starter', monthlyPrice: 2000, annualPrice: 20000, currency: 'PKR' },
  { id: 'bp3', branchCount: 3, tierName: 'Professional', monthlyPrice: 5000, annualPrice: 50000, currency: 'PKR' },
]

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={client()}>{ui}</QueryClientProvider>)

beforeEach(() => {
  vi.spyOn(hostBillingApi, 'getCatalog').mockResolvedValue(ok({ plans: catalog }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Subscription & Billing: tier name and currency from the server', () => {
  beforeEach(() => {
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't1', status: 'ACTIVE' } }) as never)
    vi.spyOn(hostBillingApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 1, activeBranches: 1, usedBranches: 1, buildableBranches: 0, remainingBranches: 0 }) as never)
    vi.spyOn(hostBillingApi, 'getBankInstructions').mockResolvedValue(ok(null) as never)
    vi.spyOn(planPaymentsApi, 'getOverview').mockResolvedValue(ok(PLAN_PAYMENT_OVERVIEW) as never)
    vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(ok({
      id: 's1', status: 'ACTIVE', platform: 'IOS', branchCount: 1, amount: 6.99, currency: 'USD', billingCycle: 'MONTHLY',
      startDate: '2026-10-01', endDate: '2026-11-01', entitled: true, package: { name: 'Gold Package' },
    }) as never)
  })

  it('names the plan with the tier the app shows, never a package name', async () => {
    wrap(<BillingPage />)
    expect(await screen.findByText('Starter Plan')).toBeInTheDocument()
    expect(screen.queryByText('Gold Package')).not.toBeInTheDocument()
  })

  it('prints the amount in the currency the plan was charged in', async () => {
    wrap(<BillingPage />)
    await screen.findByText('Starter Plan')
    expect(screen.getByText(/(US\$|\$|USD)\s?6\.99/)).toBeInTheDocument()
    expect(screen.queryByText(/Rs\s?7\b/)).not.toBeInTheDocument()
  })
})

describe('Admin tenant Subscription tab: tier names', () => {
  it('a store plan is named by its tier, not by a package', async () => {
    vi.spyOn(adminApi, 'getTenantSubscriptions').mockResolvedValue(ok({ subscriptions: [
      { id: 's1', status: 'ACTIVE', platform: 'ANDROID', branchCount: 3, amount: 5000, currency: 'PKR', billingCycle: 'MONTHLY', startDate: '2026-10-01', endDate: '2026-11-01', package: null },
    ] }) as never)
    vi.spyOn(packagesApi, 'getPackages').mockResolvedValue(ok([]) as never)
    wrap(<SubscriptionTab tenantId="t1" />)
    expect(await screen.findByText(/Professional Plan/)).toBeInTheDocument()
  })
})

describe('Admin tenant Plans tab: the app naming rule and the plan currency', () => {
  it('QUARTERLY 2 is "6 Months", the price is in the plan currency, and traveller visibility is shown', async () => {
    vi.spyOn(adminApi, 'getTenantMembershipPlans').mockResolvedValue(ok({ plans: [
      { id: 'p1', name: ' Quarter Pass ', durationType: 'QUARTERLY', durationValue: 2, price: 99, currency: 'USD', status: 'ACTIVE', isPublic: false, isDeactivated: false, freezeLimitDays: 0, isTrial: false, branch: { branchName: 'Uptown' } },
    ] }) as never)
    wrap(<PlansTab tenant={{ status: 'ACTIVE' } as never} tenantId="t1" />)
    const row = await screen.findByTestId('admin-plan-p1')
    expect(within(row).getByText('Quarter Pass')).toBeInTheDocument()
    expect(within(row).getByText(/6 Months/)).toBeInTheDocument()
    expect(within(row).getByText(/(US\$|\$|USD)\s?99/)).toBeInTheDocument()
    expect(within(row).getByText('Hidden from travellers')).toBeInTheDocument()
  })
})

describe('First plan of a new branch or organization: one period, as the app sends it', () => {
  it.each([['MONTHLY', 1], ['QUARTERLY', 1], ['YEARLY', 1]])('%s sends durationValue %i', (type, value) => {
    expect(firstPlanPackage('Gold', 3000, type)).toEqual({ name: 'Gold', price: 3000, durationType: type, durationValue: value })
  })

  it('New Organization sends one year for a yearly first plan', async () => {
    fakePlaces()
    vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
    vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([]) as never)
    vi.spyOn(hostApi, 'getListings').mockResolvedValue(ok([{ id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }]) as never)
    vi.spyOn(hostApi, 'getListingBranches').mockResolvedValue(ok({ branches: [] }) as never)
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 6, usedBranches: 1, remainingBranches: 5, activeBranches: 1, buildableBranches: 5, overQuotaCount: 0 }) as never)
    vi.spyOn(hostApi, 'getOrganizationQuota').mockResolvedValue(ok({ maxOrganizations: 3, canCreateNext: true, blockingListingStatus: null }) as never)
    vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
    const createListing = vi.spyOn(hostApi, 'createListing').mockResolvedValue(ok({ id: 'listing-3', title: 'Peak', status: 'PENDING' }) as never)

    wrap(<BranchesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /new organization/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText(/organization name/i), { target: { value: 'Peak Fitness' } })
    await pickPlace('City', 'Lah', /Lahore/, dialog)
    fireEvent.change(within(dialog).getByLabelText('Address', { exact: true }), { target: { value: '12 Mall Road' } })
    fireEvent.change(within(dialog).getByLabelText(/first plan/i), { target: { value: 'Yearly' } })
    fireEvent.change(within(dialog).getByLabelText(/^price/i), { target: { value: '30000' } })
    fireEvent.change(dialog.querySelector('#org-plan-duration') as HTMLSelectElement, { target: { value: 'YEARLY' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /create organization/i }))

    await waitFor(() => expect(createListing).toHaveBeenCalledTimes(1))
    expect((createListing.mock.calls[0][0] as any).packages[0]).toMatchObject({ durationType: 'YEARLY', durationValue: 1 })
  })
})
