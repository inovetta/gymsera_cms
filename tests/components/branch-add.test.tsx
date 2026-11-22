import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { hostApi } from '@/lib/api/host'
import { organizationsApi } from '@/lib/api/organizations'
import { citiesApi } from '@/lib/api/cities'
import { meApi, MyContext } from '@/lib/api/me'
import { apiError, ok } from '../fixtures/team'
import { ownerContext, orgAdminContext } from '../fixtures/context'
import { fakePlaces } from '../fixtures/places'
import { fakeStagingUploads, fillAddBranch } from '../fixtures/branch-form'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))
// Radix Select does not open in jsdom: stand in a native <select> with the same props.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children, disabled }: any) => (
    <select value={value ?? ''} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

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

const LISTINGS = [
  { id: 'listing-1', name: 'Iron Gym', status: 'ACTIVE', canReceiveBranches: true },
  { id: 'listing-2', name: 'Fit Hub', status: 'ACTIVE', canReceiveBranches: true },
]
const branch = (id: string, name: string, listingId: string) => ({ id, branchName: name, status: 'ACTIVE', address: 'x', businessId: listingId })

const quota = (over = {}) => ({ maxBranches: 6, usedBranches: 5, remainingBranches: 1, activeBranches: 5, buildableBranches: 1, overQuotaCount: 0, ...over })

const mount = (context: MyContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <BranchesPage />
    </QueryClientProvider>
  )
}

let createBranch: ReturnType<typeof vi.spyOn>
let getQuota: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  accountRole = 'GYM_HOST'
  fakePlaces()
  fakeStagingUploads()
  vi.spyOn(organizationsApi, 'getMine').mockResolvedValue(ok({ organization: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([{ id: 1, name: 'Peshawar' }]) as never)
  vi.spyOn(citiesApi, 'getAreas').mockResolvedValue(ok({ areas: [] }) as never)
  vi.spyOn(hostApi, 'getBusinesses').mockResolvedValue(ok(LISTINGS) as never)
  vi.spyOn(hostApi, 'getBusinessBranches').mockImplementation((async (id: string) =>
    ok({ branches: id === 'listing-1' ? [branch('b1', 'Uptown', 'listing-1')] : [branch('b2', 'Downtown', 'listing-2')] })) as never)
  vi.spyOn(hostApi, 'getBusinessQuota').mockResolvedValue(ok({ pool: { max: 3, used: 2, reserved: 0, free: 1 }, canAddBusiness: true, blockingBusinessStatus: null }) as never)
  getQuota = vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok(quota()) as never)
  vi.spyOn(organizationsApi, 'getBranches').mockResolvedValue(ok({ branches: [branch('b9', 'Legacy', 'listing-1')] }) as never)
  createBranch = vi.spyOn(hostApi, 'createBranch').mockResolvedValue(ok({ branch: branch('b3', 'New One', 'listing-1') }) as never)
})
afterEach(() => vi.restoreAllMocks())

/** Open Add Branch (the shared dialog, D8), fill the required fields and press Create Branch. */
const addBranch = async () => {
  fireEvent.click((await screen.findAllByRole('button', { name: /add branch/i }))[0])
  const dialog = await screen.findByRole('dialog')
  await fillAddBranch(dialog)
  fireEvent.click(within(dialog).getByRole('button', { name: /^create branch$/i }))
}

describe('Business strip (mobile _buildSubTabBar)', () => {
  it('shows the owner’s businesses as tabs and lists the selected business’s branches', async () => {
    mount(ownerContext)

    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Iron Gym', 'Fit Hub'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Uptown')).toBeInTheDocument()
    expect(hostApi.getBusinessBranches).toHaveBeenCalledWith('listing-1')

    fireEvent.click(tabs[1])
    expect(await screen.findByText('Downtown')).toBeInTheDocument()
    expect(screen.queryByText('Uptown')).not.toBeInTheDocument()
  })
})

describe('Add branch — attempt first, upsell only after a 403 (UX-19)', () => {
  it('sends the branch to POST /host/branches for the selected business without checking capacity first', async () => {
    getQuota.mockResolvedValue(ok(quota({ activeBranches: 6, usedBranches: 6, remainingBranches: 0, buildableBranches: 0 })) as never)
    mount(ownerContext)
    fireEvent.click((await screen.findAllByRole('tab'))[1])
    await screen.findByText('Downtown')

    await addBranch()

    await waitFor(() => expect(createBranch).toHaveBeenCalledTimes(1))
    const body = createBranch.mock.calls[0][0]
    expect(body).toMatchObject({ branchName: 'New One', businessId: 'listing-2', address: '12 Mall Road', cityId: 7, areaId: 70, openingTime: '06:00', closingTime: '22:00' })
    expect(body.imagesJson).toHaveLength(3)
    expect(body.packages.length).toBeGreaterThan(0)
    // Even with the plan full, the attempt was made; no upsell appears when it succeeds.
    expect(screen.queryByText('One more branch needed')).not.toBeInTheDocument()
  })

  it('refreshes the capacity banner after a branch is added', async () => {
    mount(ownerContext)
    await screen.findByText('5 of 6 branches used')
    await addBranch()

    await waitFor(() => expect(getQuota.mock.calls.length).toBeGreaterThan(1))
  })

  it('403 branch_limit_reached → the upsell: explanation, "Continue in the GymsEra app", and the draft is kept', async () => {
    createBranch.mockRejectedValueOnce(apiError(403, 'Branch limit reached for your current plan.', 'branch_limit_reached'))
    mount(ownerContext)
    await addBranch()

    const upsell = await screen.findByText('One more branch needed')
    expect(upsell).toBeInTheDocument()
    expect(
      screen.getByText(/Your plan is fully used, so "New One" needs one more branch on your subscription\./)
    ).toBeInTheDocument()
    expect(screen.getByText(/Everything you've filled in is saved/)).toBeInTheDocument()
    const app = screen.getByRole('link', { name: /continue in the gymsera app/i })
    expect(app).toHaveAttribute('href', expect.stringMatching(/^https:\/\//))
    expect(app).toHaveAttribute('target', '_blank')
    // No store plan or card payment is offered on the web.
    expect(screen.queryByText(/stripe|card|subscribe now/i)).not.toBeInTheDocument()
  })

  it('"Try again" after adding capacity in the app sends the same branch again and finishes', async () => {
    createBranch.mockRejectedValueOnce(apiError(403, 'Branch limit reached for your current plan.', 'branch_limit_reached'))
    mount(ownerContext)
    await addBranch()
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }))

    await waitFor(() => expect(createBranch).toHaveBeenCalledTimes(2))
    expect(createBranch.mock.calls[1][0]).toEqual(createBranch.mock.calls[0][0])
    await waitFor(() => expect(screen.queryByText('One more branch needed')).not.toBeInTheDocument())
  })

  it('"Not now" closes the explanation and keeps what was typed', async () => {
    createBranch.mockRejectedValueOnce(apiError(403, 'x', 'branch_limit_reached'))
    mount(ownerContext)
    await addBranch()
    fireEvent.click(await screen.findByRole('button', { name: /not now/i }))

    await waitFor(() => expect(screen.queryByText('One more branch needed')).not.toBeInTheDocument())
    expect(screen.getByLabelText(/^branch name/i)).toHaveValue('New One')
  })

  it('403 account_over_quota → the upsell shows the server’s sentence', async () => {
    createBranch.mockRejectedValueOnce(apiError(403, 'Your account is over its branch quota.', 'account_over_quota'))
    mount(ownerContext)
    await addBranch()

    expect(await screen.findByText('One more branch needed')).toBeInTheDocument()
    expect(screen.getByText(/branch quota/i)).toBeInTheDocument()
  })

  it('403 branch_billing_locked → the billing-lock message in the form, no upsell (CAP-01)', async () => {
    createBranch.mockRejectedValueOnce(apiError(403, 'locked', 'branch_billing_locked'))
    mount(ownerContext)
    await addBranch()

    expect(await screen.findByTestId('add-branch-error')).toHaveTextContent(/locked due to plan limits/i)
    expect(screen.queryByText('One more branch needed')).not.toBeInTheDocument()
  })

  it('any other failure shows the server’s reason in the form, not a generic toast', async () => {
    createBranch.mockRejectedValueOnce(apiError(422, 'At least 1 membership package/plan is required for every branch', 'validation_error'))
    mount(ownerContext)
    await addBranch()

    expect(await screen.findByTestId('add-branch-error')).toHaveTextContent('At least 1 membership package/plan is required')
  })
})

describe('Someone who is not the owner', () => {
  it('has no business strip and no Add Branch (the host routes are owner-only); the branch list is the scoped one', async () => {
    accountRole = 'MEMBER'
    mount(orgAdminContext)

    expect(await screen.findByText('Legacy')).toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /add branch/i })).not.toBeInTheDocument()
    expect(hostApi.getBusinesses).not.toHaveBeenCalled()
  })
})

describe('Add branch — the same rules as the app (enterprise D7, D8)', () => {
  it('a business under review is shown but cannot be chosen', async () => {
    ;(hostApi.getBusinesses as any).mockResolvedValue(ok([
      ...LISTINGS,
      { id: 'listing-3', name: 'New Brand', status: 'PENDING', canReceiveBranches: false },
    ]))
    mount(ownerContext)
    fireEvent.click((await screen.findAllByRole('button', { name: /add branch/i }))[0])
    const dialog = await screen.findByRole('dialog')
    const pending = within(dialog).getByRole('option', { name: 'New Brand (Under review)' }) as HTMLOptionElement
    expect(pending.disabled).toBe(true)
    expect((within(dialog).getByLabelText(/^business/i) as HTMLSelectElement).value).toBe('listing-1')
  })

  it('hours start at 06:00–22:00; Create waits for an area and 3 photos', async () => {
    ;(hostApi.uploadStagingImages as any).mockResolvedValueOnce(['https://cdn.example.test/only.jpg'])
    mount(ownerContext)
    fireEvent.click((await screen.findAllByRole('button', { name: /add branch/i }))[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Opens')).toHaveValue('06:00')
    expect(within(dialog).getByLabelText('Closes')).toHaveValue('22:00')
    fireEvent.change(within(dialog).getByLabelText(/^photos/i), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    await within(dialog).findByText(/1 of 3 photos added/i)
    const missing = within(dialog).getByTestId('add-branch-missing')
    expect(missing).toHaveTextContent('Area')
    expect(missing).toHaveTextContent('At least 3 photos')
    expect(within(dialog).getByRole('button', { name: /^create branch$/i })).toBeDisabled()
  })

  it('409 business_not_approved: the server reason in the form, no upsell', async () => {
    createBranch.mockRejectedValueOnce(apiError(409, 'not approved', 'business_not_approved'))
    mount(ownerContext)
    await addBranch()
    expect(await screen.findByTestId('add-branch-error')).toHaveTextContent('This business is still under review. You can add branches once it is approved.')
    expect(screen.queryByText('One more branch needed')).not.toBeInTheDocument()
  })
})
