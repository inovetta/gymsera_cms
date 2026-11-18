/**
 * R-112 (owner 2026-11-18): the brand name is a real field (spec §13 "R-112").
 *
 * Before: admin tenant screens showed `businessName` only (a build 26 draft has '' until Step 2, so the row
 * was blank) and never the gym name; Settings › Profile called it "Business Name" with 2 to 200 characters,
 * re-sent it with every save and showed "Failed to update business profile" for any refusal.
 * After: the brand with the first gym's name under it (a draft without a brand shows the gym name);
 * Settings › Profile is "Brand / organization name", 3 to 60 characters, sent only when it changed, and the
 * API's refusal is shown.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TenantDetailPage from '@/app/(dashboard)/admin/tenants/[id]/page'
import BusinessProfilePage from '@/app/(dashboard)/settings/profile/page'
import { adminApi } from '@/lib/api/admin'
import { tenantsApi } from '@/lib/api/tenants'
import { citiesApi } from '@/lib/api/cities'
import { typedBrandName, tenantDisplayName, tenantSubName } from '@/lib/tenants/brand-name'
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
const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

const wrap = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function detailSpies(tenant: Record<string, unknown>) {
  vi.spyOn(adminApi, 'getTenant').mockResolvedValue(ok({ tenant: { id: 'tenant-1', email: 'o@example.test', createdAt: '2026-01-01T00:00:00Z', organizations: [], ...tenant } }) as never)
  vi.spyOn(adminApi, 'getTenantSubscriptions').mockResolvedValue(ok({ subscriptions: [] }) as never)
  vi.spyOn(adminApi, 'getTenantKycDocuments').mockResolvedValue(ok([]) as never)
}

describe('R-112 helpers', () => {
  it('a generated or empty brand is not a typed brand', () => {
    expect(typedBrandName("Amir Khan's Gym Business")).toBe('')
    expect(typedBrandName('')).toBe('')
    expect(typedBrandName(' Iron Works ')).toBe('Iron Works')
  })

  it('display name: the brand, else the gym name of a draft, else "No brand yet"; the gym under it', () => {
    expect(tenantDisplayName({ businessName: 'Iron Works', gymName: 'Iron Works Saddar' })).toBe('Iron Works')
    expect(tenantDisplayName({ businessName: '', gymName: 'Iron Den' })).toBe('Iron Den')
    expect(tenantDisplayName({ businessName: '' })).toBe('No brand yet')
    expect(tenantSubName({ businessName: 'Iron Works', gymName: 'Iron Works Saddar' })).toBe('Iron Works Saddar')
    expect(tenantSubName({ businessName: 'Iron Works', gymName: 'iron works' })).toBeNull()
    expect(tenantSubName({ businessName: '', gymName: 'Iron Den' })).toBeNull()
  })
})

describe('R-112 admin tenant detail', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the brand and the first gym under it', async () => {
    detailSpies({ businessName: 'Iron Works', gymName: 'Iron Works Saddar', status: 'ACTIVE' })
    wrap(<TenantDetailPage />)
    expect(await screen.findByRole('heading', { level: 2, name: 'Iron Works' })).toBeInTheDocument()
    expect(screen.getByTestId('tenant-gym-name')).toHaveTextContent('First gym: Iron Works Saddar')
  })

  it('a draft with no brand yet shows its gym name, never an empty title', async () => {
    detailSpies({ businessName: '', gymName: 'Iron Den', status: 'DRAFT' })
    wrap(<TenantDetailPage />)
    expect(await screen.findByRole('heading', { level: 2, name: 'Iron Den' })).toBeInTheDocument()
  })
})

describe('R-112 Settings › Profile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    toast.mockReset()
  })

  const mine = (businessName: string) => {
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't', status: 'ACTIVE', businessName, email: 'owner@example.test', phone: '', createdAt: '2026-01-01T00:00:00Z' } }) as never)
    vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([]) as never)
  }
  // The field's FormControl wraps the input with its icon, so it is found by its placeholder.
  const brandInput = async () => {
    expect(await screen.findByText('Brand / organization name *')).toBeInTheDocument()
    return screen.getByPlaceholderText('Iron Temple')
  }
  const save = () => fireEvent.click(screen.getByRole('button', { name: /save/i }))

  it('is labelled "Brand / organization name"; a short name is stopped with a message, nothing is sent', async () => {
    mine('Iron Works')
    const update = vi.spyOn(tenantsApi, 'updateMyTenant').mockResolvedValue(ok({ tenant: {} }) as never)
    wrap(<BusinessProfilePage />)
    const input = await brandInput()
    await waitFor(() => expect(input).toHaveValue('Iron Works'))
    fireEvent.change(input, { target: { value: 'ab' } })
    save()
    expect(await screen.findByText('Use 3 to 60 characters')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('an unchanged brand is not re-sent; a changed one is', async () => {
    mine('Iron Works')
    const update = vi.spyOn(tenantsApi, 'updateMyTenant').mockResolvedValue(ok({ tenant: {} }) as never)
    wrap(<BusinessProfilePage />)
    const input = await brandInput()
    await waitFor(() => expect(input).toHaveValue('Iron Works'))
    save()
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][0].businessName).toBeUndefined()

    fireEvent.change(input, { target: { value: 'Iron Works Group' } })
    save()
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update.mock.calls[1][0].businessName).toBe('Iron Works Group')
  })

  it("a build 25 generated name is not shown as the brand", async () => {
    mine("Amir Khan's Gym Business")
    wrap(<BusinessProfilePage />)
    const input = await brandInput()
    await waitFor(() => expect(screen.getByDisplayValue('owner@example.test')).toBeInTheDocument())
    expect(input).toHaveValue('')
  })

  it("the API's refusal is shown, not a generic failure", async () => {
    mine('Iron Works')
    vi.spyOn(tenantsApi, 'updateMyTenant').mockRejectedValue(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        response: { status: 422, data: { success: false, code: 'brand_name_blocked', message: 'Please choose a different name.' } },
      }),
    )
    wrap(<BusinessProfilePage />)
    const input = await brandInput()
    await waitFor(() => expect(input).toHaveValue('Iron Works'))
    fireEvent.change(input, { target: { value: 'Some Brand' } })
    save()
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(toast.mock.calls.at(-1)?.[0].description).toBe('Please choose a different name.')
  })
})
