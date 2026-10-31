import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { hostApi } from '@/lib/api/host'
import { gymApi } from '@/lib/api/gym'
import { citiesApi } from '@/lib/api/cities'
import { meApi } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { resolveApiError } from '@/lib/api/error-copy'
import { ok } from '../fixtures/team'
import { ownerContext } from '../fixtures/context'
import { fakePlaces } from '../fixtures/places'

/**
 * Phase 7 P9, NEW-167: the CMS half of P5b (R-81 revised).
 * Before: New Organization offered "Move an existing branch here" (POST /host/branches/:id/move, a
 * route P5b removed, answers 404); a 409 branch_delete_blocked showed the raw message with no way out;
 * no pause / resume; the store-plan notice after the last branch went was dropped; the copy said
 * "You cannot delete the only branch" (the API deletes the organization with it since P5b).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Hira Khan', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

const live = { id: 'b1', branchName: 'Uptown Gym', status: 'ACTIVE', address: 'x', gymListingId: 'listing-1', pausedAt: null }
const paused = { id: 'b2', branchName: 'Quiet Gym', status: 'ACTIVE', address: 'y', gymListingId: 'listing-1', pausedAt: '2026-10-30T10:00:00Z' }

let deleteBranch: ReturnType<typeof vi.spyOn>
let pauseBranch: ReturnType<typeof vi.spyOn>
let resumeBranch: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fakePlaces()
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([]) as never)
  vi.spyOn(hostApi, 'getListings').mockResolvedValue(ok([
    { id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' },
    { id: 'listing-2', title: 'Fit Hub', status: 'ACTIVE' },
  ]) as never)
  vi.spyOn(hostApi, 'getListingBranches').mockResolvedValue(ok({ branches: [live, paused] }) as never)
  vi.spyOn(hostApi, 'getAllBranches').mockResolvedValue(ok({ branches: [live, paused] }) as never)
  vi.spyOn(hostApi, 'getOrganizationQuota').mockResolvedValue(ok({ maxOrganizations: 3, canCreateNext: true, blockingListingStatus: null }) as never)
  vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 6, usedBranches: 2, remainingBranches: 4, activeBranches: 2, buildableBranches: 4, overQuotaCount: 0 }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [live] }) as never)
  deleteBranch = vi.spyOn(hostApi, 'deleteBranch').mockResolvedValue(ok({ message: 'Branch deleted successfully', organizationDeleted: false, storePlanNotice: null }) as never)
  pauseBranch = vi.spyOn(hostApi, 'pauseBranch').mockResolvedValue(ok({ branch: { ...live, pausedAt: '2026-10-31T00:00:00Z' } }) as never)
  resumeBranch = vi.spyOn(hostApi, 'resumeBranch').mockResolvedValue(ok({ branch: { ...paused, pausedAt: null } }) as never)
})
afterEach(() => vi.restoreAllMocks())

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <BranchesPage />
    </QueryClientProvider>
  )

const startDelete = async () => {
  await screen.findByText('Uptown Gym')
  fireEvent.click(within(screen.getByTestId('branch-card-b1')).getByText(/^delete branch$/i))
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.change(within(dialog).getByLabelText(/account password/i), { target: { value: 'placeholder-pass' } })
  fireEvent.click(within(dialog).getByRole('button', { name: /^delete branch$/i }))
}

const blocked = () => ({
  response: {
    status: 409,
    data: {
      success: false,
      code: 'branch_delete_blocked',
      message: 'This branch still has active members, upcoming bookings or payments to settle. Settle them or wait until they end, or pause the branch instead.',
      data: {
        branchId: 'b1', branchName: 'Uptown Gym', canPause: true,
        counts: { activeMemberships: 3, upcomingBookings: 0, pendingPayments: 1, cashCollectedPayments: 0 },
        reasons: [{ code: 'active_memberships', count: 3 }, { code: 'pending_payments', count: 1 }],
      },
    },
  },
})

describe('NEW-167: New Organization has no "move an existing branch"', () => {
  it('opens straight on building the first branch; nothing calls the removed move route', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /new organization/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/move an existing branch/i)).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText(/organization name/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('City', { exact: true })).toBeInTheDocument()
    expect(within(dialog).queryByDisplayValue('Standard Membership')).not.toBeInTheDocument()
    expect((hostApi as Record<string, unknown>).moveBranch).toBeUndefined()
  })
})

describe('NEW-167: a delete the API refuses (409 branch_delete_blocked)', () => {
  it('says why, with the counts, and offers "Pause instead", which pauses the branch', async () => {
    deleteBranch.mockRejectedValueOnce(blocked())
    mount()
    await startDelete()
    const dialog = await screen.findByRole('dialog', { name: /this branch can.t be deleted yet/i })
    expect(dialog).toHaveTextContent('3 members with time left on a paid membership')
    expect(dialog).toHaveTextContent('1 payment waiting for approval')
    fireEvent.click(within(dialog).getByRole('button', { name: /pause instead/i }))
    await waitFor(() => expect(pauseBranch).toHaveBeenCalledWith('b1'))
  })
})

describe('NEW-167: pause and resume', () => {
  it('a paused branch says so and offers Resume; a live one offers Pause', async () => {
    mount()
    const pausedCard = await screen.findByTestId('branch-card-b2')
    expect(pausedCard).toHaveTextContent(/paused/i)
    expect(pausedCard).toHaveTextContent(/hidden from travellers/i)
    fireEvent.click(within(pausedCard).getByText(/^resume$/i))
    await waitFor(() => expect(resumeBranch).toHaveBeenCalledWith('b2'))
    fireEvent.click(within(screen.getByTestId('branch-card-b1')).getByText(/^pause$/i))
    await waitFor(() => expect(pauseBranch).toHaveBeenCalledWith('b1'))
  })
})

describe('NEW-167: the store-plan notice after the organization went with its last branch', () => {
  it('shows the API sentence and a link to the store subscriptions', async () => {
    deleteBranch.mockResolvedValueOnce(ok({
      message: 'Branch deleted successfully',
      organizationDeleted: true,
      storePlanNotice: {
        platform: 'IOS',
        manageUrl: 'https://apps.apple.com/account/subscriptions',
        message: 'Your GymsEra plan still renews through the App Store. Deleting an organization does not cancel it.',
      },
    }) as never)
    mount()
    await startDelete()
    const notice = await screen.findByRole('alertdialog', { name: /your plan still renews/i })
    expect(notice).toHaveTextContent('still renews through the App Store')
    expect(within(notice).getByRole('link', { name: /open subscriptions/i })).toHaveAttribute('href', 'https://apps.apple.com/account/subscriptions')
  })
})

describe('NEW-167: copy follows the API', () => {
  const err = (code: string) => ({ response: { status: 409, data: { code, message: 'x' } } })
  it('last branch: deleting it deletes the organization (not "you cannot delete the only branch")', () => {
    expect(resolveApiError(err('last_branch_in_organization')).message).toMatch(/also deletes the organization/i)
    expect(resolveApiError(err('last_branch_in_organization')).message).not.toMatch(/cannot delete the only branch/i)
  })
  it('the delete blocks have their own copy', () => {
    expect(resolveApiError(err('branch_delete_blocked')).message).toMatch(/pause the branch instead/i)
    expect(resolveApiError(err('organization_delete_blocked')).message).toMatch(/pause those branches instead/i)
  })
})
