import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TenantDetailPage from '@/app/(dashboard)/admin/tenants/[id]/page'
import { adminApi } from '@/lib/api/admin'
import { packagesApi } from '@/lib/api/packages'
import { citiesApi } from '@/lib/api/cities'
import { ok } from '../fixtures/team'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: 'tenant-1' }),
}))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'a', email: 'admin@example.test' }, isPlatformAdmin: true }),
}))
vi.mock('@/components/features/gym-listing-tab', () => ({ GymListingTab: () => <div data-testid="gym-listing-tab" /> }))

const tenant = {
  id: 'tenant-1',
  businessName: 'Iron Works',
  status: 'ACTIVE',
  email: 'owner@example.test',
  createdAt: '2026-01-01T00:00:00Z',
  organizations: [],
}

function spies() {
  return {
    getTenant: vi.spyOn(adminApi, 'getTenant').mockResolvedValue(ok({ tenant }) as never),
    getTenantSubscriptions: vi.spyOn(adminApi, 'getTenantSubscriptions').mockResolvedValue(ok({ subscriptions: [] }) as never),
    getTenantKycDocuments: vi.spyOn(adminApi, 'getTenantKycDocuments').mockResolvedValue(ok([]) as never),
    getTenantInvoices: vi.spyOn(adminApi, 'getTenantInvoices').mockResolvedValue(ok({ invoices: [] }) as never),
    getTenantBranches: vi.spyOn(adminApi, 'getTenantBranches').mockResolvedValue(ok({ branches: [] }) as never),
    getTenantMembers: vi.spyOn(adminApi, 'getTenantMembers').mockResolvedValue(ok({ members: [] }) as never),
    getTenantMembershipPlans: vi.spyOn(adminApi, 'getTenantMembershipPlans').mockResolvedValue(ok({ plans: [] }) as never),
    getTenantCapacityAudit: vi.spyOn(adminApi, 'getTenantCapacityAudit').mockResolvedValue(ok({ audit: null }) as never),
    getPackages: vi.spyOn(packagesApi, 'getPackages').mockResolvedValue(ok([]) as never),
    getCities: vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([]) as never),
  }
}

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantDetailPage />
    </QueryClientProvider>
  )
}

describe('Admin tenant detail fetches only the open tab (UX-17, PERF-10)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('on open: the tenant, the header subscription and the Overview tab data, nothing else', async () => {
    const s = spies()
    renderPage()
    await screen.findByRole('tab', { name: /invoices/i })
    await waitFor(() => expect(s.getTenantKycDocuments).toHaveBeenCalledTimes(1))

    expect(s.getTenant).toHaveBeenCalledTimes(1)
    expect(s.getTenantSubscriptions).toHaveBeenCalledTimes(1)
    for (const idle of ['getTenantInvoices', 'getTenantBranches', 'getTenantMembers', 'getTenantMembershipPlans', 'getTenantCapacityAudit', 'getPackages', 'getCities'] as const) {
      expect(s[idle], idle).not.toHaveBeenCalled()
    }
  })

  it('opening Invoices fetches invoices only', async () => {
    const s = spies()
    renderPage()
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /invoices/i }))
    await waitFor(() => expect(s.getTenantInvoices).toHaveBeenCalledTimes(1))
    expect(s.getTenantBranches).not.toHaveBeenCalled()
    expect(s.getTenantMembers).not.toHaveBeenCalled()
    expect(await screen.findByText(/no invoices yet/i)).toBeInTheDocument()
  })

  it('opening Branches fetches branches; cities wait for the add dialog', async () => {
    const s = spies()
    renderPage()
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /^branches$/i }))
    await waitFor(() => expect(s.getTenantBranches).toHaveBeenCalledTimes(1))
    expect(s.getCities).not.toHaveBeenCalled()
    expect(s.getTenantInvoices).not.toHaveBeenCalled()
  })

  it('opening Subscription shows the history from the shared cache and refreshes only that list', async () => {
    const s = spies()
    renderPage()
    await waitFor(() => expect(s.getTenantSubscriptions).toHaveBeenCalledTimes(1))
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /subscription/i }))
    expect(await screen.findByText(/subscription history/i)).toBeInTheDocument()
    // A stale cached list is refreshed once on open; nothing else is requested.
    await waitFor(() => expect(s.getTenantSubscriptions.mock.calls.length).toBeLessThanOrEqual(2))
    expect(s.getTenantInvoices).not.toHaveBeenCalled()
    expect(s.getTenantBranches).not.toHaveBeenCalled()
  })

  it('a tab whose load fails shows its own retryable error, the rest of the page stays', async () => {
    const s = spies()
    s.getTenantInvoices.mockRejectedValue({ response: { status: 503, data: { error: { code: 'internal_error', message: 'down', requestId: 'req_inv' } } } })
    renderPage()
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /invoices/i }))
    expect(await screen.findByText('req_inv')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Iron Works' })).toBeInTheDocument()
  })
})
