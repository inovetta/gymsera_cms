import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { hostApi } from '@/lib/api/host'
import { gymApi } from '@/lib/api/gym'
import { citiesApi } from '@/lib/api/cities'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { apiError, ok } from '../fixtures/team'
import { ownerContext, orgAdminContext } from '../fixtures/context'
import { fakePlaces, pickPlace } from '../fixtures/places'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))

let accountRole = 'GYM_HOST'
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Hira Khan', role: accountRole },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: accountRole === 'GYM_HOST',
    isBranchManager: false,
  }),
}))

const L1 = { id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }
const L2 = { id: 'listing-2', title: 'Fit Hub', status: 'ACTIVE' }
const B1 = { id: 'b1', branchName: 'Uptown', status: 'ACTIVE', address: 'x', gymListingId: 'listing-1' }
const B2 = { id: 'b2', branchName: 'Downtown', status: 'ACTIVE', address: 'y', gymListingId: 'listing-2' }
const quota = (over = {}) => ({ maxBranches: 6, usedBranches: 5, remainingBranches: 1, activeBranches: 5, buildableBranches: 1, overQuotaCount: 0, ...over })

let createListing: ReturnType<typeof vi.spyOn>
let getListings: ReturnType<typeof vi.spyOn>
let getQuota: ReturnType<typeof vi.spyOn>
let orgQuota: ReturnType<typeof vi.spyOn>

const mount = (context: MyContext, listings = [L1, L2]) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  getListings.mockResolvedValue(ok(listings) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <BranchesPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'GYM_HOST'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([{ id: 1, name: 'Peshawar' }]) as never)
  vi.spyOn(citiesApi, 'getAreas').mockResolvedValue(ok({ areas: [] }) as never)
  getListings = vi.spyOn(hostApi, 'getListings')
  vi.spyOn(hostApi, 'getListingBranches').mockImplementation((async (id: string) => ok({ branches: id === 'listing-1' ? [B1] : [B2] })) as never)
  vi.spyOn(hostApi, 'getAllBranches').mockResolvedValue(ok({ branches: [B1, B2] }) as never)
  getQuota = vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok(quota()) as never)
  orgQuota = vi.spyOn(hostApi, 'getOrganizationQuota').mockResolvedValue(
    ok({ maxOrganizations: 3, usedOrganizations: 2, remainingOrganizations: 1, canCreateNext: true, blockingListingStatus: null }) as never
  )
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
  createListing = vi.spyOn(hostApi, 'createListing').mockResolvedValue(ok({ id: 'listing-3', title: 'Peak', status: 'PENDING' }) as never)
  fakePlaces()
})
afterEach(() => vi.restoreAllMocks())

const openDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /new organization/i }))
  return screen.findByRole('dialog')
}

/**
 * Fill the form: the city is picked through /places (NEW-140; Lahore is city 7 in fixtures/places.ts),
 * the address is typed, and the first plan is the host's own (nothing is filled in for them).
 * "Move an existing branch" was removed with its route (P5b item 8, R-81; NEW-167).
 */
const buildNewForm = async () => {
  const dialog = await openDialog()
  fireEvent.change(await within(dialog).findByLabelText(/organization name/i), { target: { value: 'Peak Fitness' } })
  fireEvent.change(within(dialog).getByLabelText(/description/i), { target: { value: 'A new gym' } })
  await pickPlace('City', 'Lah', /Lahore/, dialog)
  fireEvent.change(within(dialog).getByLabelText('Address', { exact: true }), { target: { value: '12 Mall Road' } })
  fireEvent.change(within(dialog).getByLabelText(/first plan/i), { target: { value: 'Monthly' } })
  fireEvent.change(within(dialog).getByLabelText(/^price/i), { target: { value: '3000' } })
  return dialog
}

describe('New organization — with its first branch (UX-20, NEW-167)', () => {
  it('says what the first branch uses (capacity read from the one quota)', async () => {
    mount(ownerContext)
    const dialog = await openDialog()

    expect(await within(dialog).findByText(/It uses 1 of your 1 remaining branch\./)).toBeInTheDocument()
    expect(within(dialog).queryByText(/move/i)).not.toBeInTheDocument()
  })

  it('with no room, it can still be filled in (attempt first) and says so', async () => {
    getQuota.mockResolvedValue(ok(quota({ activeBranches: 6, usedBranches: 6, remainingBranches: 0, buildableBranches: 0 })) as never)
    mount(ownerContext)
    const dialog = await openDialog()

    expect(await within(dialog).findByText(/If your plan has no room, you can add a branch when you create it\./)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/organization name/i)).not.toBeDisabled()
  })

  it('is blocked, with the mobile wording, while the previous organization is a draft or waiting for review', async () => {
    orgQuota.mockResolvedValue(ok({ maxOrganizations: 3, canCreateNext: false, blockingListingStatus: 'DRAFT' }) as never)
    mount(ownerContext)
    expect(await screen.findByText('Complete and submit your current organization before adding another.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new organization/i })).toBeDisabled()
  })

  it('under review: asks to wait for approval', async () => {
    orgQuota.mockResolvedValue(ok({ maxOrganizations: 3, canCreateNext: false, blockingListingStatus: 'PENDING' }) as never)
    mount(ownerContext)
    expect(await screen.findByText('Your current organization must be approved before you can add another.')).toBeInTheDocument()
  })

  it('is not offered to someone who is not the owner', async () => {
    accountRole = 'MEMBER'
    mount(orgAdminContext)
    await screen.findByText('Branches', { selector: 'h2' })
    expect(screen.queryByRole('button', { name: /new organization/i })).not.toBeInTheDocument()
  })
})

describe('New organization — build a new branch', () => {
  it('creates it on POST /host/listings with branchSource "new" and a first plan, then refreshes everything it touches', async () => {
    mount(ownerContext)
    const dialog = await buildNewForm()
    fireEvent.click(within(dialog).getByRole('button', { name: /create organization/i }))

    await waitFor(() => expect(createListing).toHaveBeenCalledTimes(1))
    const body = createListing.mock.calls[0][0]
    expect(body).toMatchObject({ gymName: 'Peak Fitness', gymDescription: 'A new gym', genderType: 'MIXED', branchSource: 'new', address: '12 Mall Road', cityId: 7 })
    expect(body.packages.length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(getListings.mock.calls.length).toBeGreaterThan(1)
    expect(getQuota.mock.calls.length).toBeGreaterThan(1)
    expect(orgQuota.mock.calls.length).toBeGreaterThan(1)
  })

  it('403 branch_limit_reached: the upsell with "Continue in the GymsEra app"; "Try again" resends the same organization', async () => {
    createListing.mockRejectedValueOnce(apiError(403, 'Branch limit reached for your current plan.', 'branch_limit_reached'))
    mount(ownerContext)
    const dialog = await buildNewForm()
    fireEvent.click(within(dialog).getByRole('button', { name: /create organization/i }))

    expect(await screen.findByText('One more branch needed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /continue in the gymsera app/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(createListing).toHaveBeenCalledTimes(2))
    expect(createListing.mock.calls[1][0]).toEqual(createListing.mock.calls[0][0])
  })

  it.each([
    ['organization_limit_reached', 'Organization limit reached'],
    ['approval_pending', 'Your previous organization is currently under review. You can create a new one once it is approved.'],
  ])('403 %s: shows the server’s reason in the form, no upsell', async (code, message) => {
    createListing.mockRejectedValueOnce(apiError(403, message, code))
    mount(ownerContext)
    const dialog = await buildNewForm()
    fireEvent.click(within(dialog).getByRole('button', { name: /create organization/i }))

    expect(await within(dialog).findByTestId('new-org-error')).toHaveTextContent(message)
    expect(screen.queryByText('One more branch needed')).not.toBeInTheDocument()
  })
})
