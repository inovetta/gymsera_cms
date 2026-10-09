import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BillingPage from '@/app/(dashboard)/settings/billing/page'
import { hostBillingApi, CatalogPlan } from '@/lib/api/host-billing'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid="header" />,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

const samplePlans: CatalogPlan[] = [
  {
    id: 'plan-3-branch',
    branchCount: 3,
    monthlyPrice: 15000,
    annualPrice: 150000,
    currency: 'PKR',
  },
  {
    id: 'plan-5-branch',
    branchCount: 5,
    monthlyPrice: 25000,
    annualPrice: 250000,
    currency: 'PKR',
  },
]

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BillingPage />
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BillingPage — Plan Catalog (NEW-46a)', () => {
  it('renders catalog plans when backend returns { plans: [...] } object shape', async () => {
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't1', name: 'Alpha Gym', status: 'ACTIVE' } }) as never)
    vi.spyOn(tenantsApi, 'getPackages').mockResolvedValue(ok([]) as never)
    vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(ok(null) as never)
    vi.spyOn(hostBillingApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 1, activeBranches: 1, usedBranches: 1, buildableBranches: 0, remainingBranches: 0 }) as never)
    vi.spyOn(hostBillingApi, 'getCatalog').mockResolvedValue(ok({ plans: samplePlans }) as never)

    renderPage()

    expect(await screen.findByText(/3 branches/i)).toBeInTheDocument()
    expect(screen.getByText(/5 branches/i)).toBeInTheDocument()
  })

  it('renders catalog plans when backend returns a direct array [...] shape', async () => {
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't1', name: 'Alpha Gym', status: 'ACTIVE' } }) as never)
    vi.spyOn(tenantsApi, 'getPackages').mockResolvedValue(ok([]) as never)
    vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(ok(null) as never)
    vi.spyOn(hostBillingApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 1, activeBranches: 1, usedBranches: 1, buildableBranches: 0, remainingBranches: 0 }) as never)
    vi.spyOn(hostBillingApi, 'getCatalog').mockResolvedValue(ok(samplePlans) as never)

    renderPage()

    expect(await screen.findByText(/3 branches/i)).toBeInTheDocument()
    expect(screen.getByText(/5 branches/i)).toBeInTheDocument()
  })
})
