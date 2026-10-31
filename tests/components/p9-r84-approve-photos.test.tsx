import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TenantDetailPage from '@/app/(dashboard)/admin/tenants/[id]/page'
import { adminApi } from '@/lib/api/admin'
import { apiError, ok } from '../fixtures/team'

/**
 * Phase 7 P9, NEW-158 / R-84: the admin sees every photo the approval publishes, can remove one, and
 * approves only after ticking "I checked the photos" (the API refuses without photosChecked: true).
 * Before: the approve dialog was a plain "Approve "…"?" confirm with no photo (BUG-30: a screenshot of
 * the app became a live gym's cover).
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: 'tenant-1' }),
}))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'a', email: 'admin@example.test' }, isPlatformAdmin: true }) }))
vi.mock('@/components/features/gym-listing-tab', () => ({ GymListingTab: () => <div /> }))

const PHOTOS = [
  { url: 'https://cdn.gymsera.test/cover.jpg', kind: 'cover' },
  { url: 'https://cdn.gymsera.test/screenshot.png', kind: 'gallery' },
]
const tenant = (photos = PHOTOS) => ({
  id: 'tenant-1', businessName: 'Iron Works', status: 'PENDING_REVIEW', email: 'o@example.test',
  createdAt: '2026-01-01T00:00:00Z', organizations: [], approvalPhotos: photos,
})

let approve: ReturnType<typeof vi.spyOn>
let remove: ReturnType<typeof vi.spyOn>
let getTenant: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  getTenant = vi.spyOn(adminApi, 'getTenant').mockResolvedValue(ok({ tenant: tenant() }) as never)
  vi.spyOn(adminApi, 'getTenantSubscriptions').mockResolvedValue(ok({ subscriptions: [] }) as never)
  vi.spyOn(adminApi, 'getTenantKycDocuments').mockResolvedValue(ok([]) as never)
  approve = vi.spyOn(adminApi, 'approveTenant').mockResolvedValue(ok({ tenant: { id: 'tenant-1' }, provisioning: null }) as never)
  remove = vi.spyOn(adminApi, 'removeApprovalPhoto').mockResolvedValue(ok({ removedFrom: 'gallery' }) as never)
})
afterEach(() => vi.restoreAllMocks())

const openApprove = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TenantDetailPage />
    </QueryClientProvider>
  )
  fireEvent.click(await screen.findByRole('button', { name: /^approve$/i }))
  return screen.findByRole('dialog')
}

describe('R-84: approve screen photo check', () => {
  it('shows every photo the approval publishes; Approve waits for the tick', async () => {
    const dialog = await openApprove()
    const imgs = within(dialog).getAllByRole('img')
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(PHOTOS.map((p) => p.url))
    const confirm = within(dialog).getByRole('button', { name: /^approve$/i })
    expect(confirm).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /i checked the photos/i }))
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1))
    expect(approve.mock.calls[0][2]).toEqual({ photosChecked: true })
  })

  it('Remove takes a photo off the application and reloads the list; the tick must be given again', async () => {
    const dialog = await openApprove()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /i checked the photos/i }))
    getTenant.mockResolvedValue(ok({ tenant: tenant([PHOTOS[0]]) }) as never)
    fireEvent.click(within(dialog).getByRole('button', { name: /remove photo 2/i }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith('tenant-1', PHOTOS[1].url))
    await waitFor(() => expect(within(dialog).getAllByRole('img')).toHaveLength(1))
    expect(within(dialog).getByRole('checkbox', { name: /i checked the photos/i })).not.toBeChecked()
  })

  it('no photos: says so, and the tick still confirms the check', async () => {
    getTenant.mockResolvedValue(ok({ tenant: tenant([]) }) as never)
    const dialog = await openApprove()
    expect(within(dialog).getByText(/this gym has no photos yet/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^approve$/i })).toBeDisabled()
  })

  it('422 visible_plan_required: plain words for the admin in the dialog, not the host copy', async () => {
    approve.mockRejectedValue(apiError(422, 'This gym has no plan travellers can see. The host must add one before approval.', 'visible_plan_required'))
    const dialog = await openApprove()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /i checked the photos/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /^approve$/i }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent(/no plan travellers can see/i)
    expect(alert).toHaveTextContent(/ask the host/i)
    expect(alert).not.toHaveTextContent(/before you submit/i)
  })
})
