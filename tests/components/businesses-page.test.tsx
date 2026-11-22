/**
 * Enterprise spec §4 / D7-D11, contract v2 (R-120): the host Businesses page. The organization header
 * with the plan pool; one card per business with its branches, status chip, verified check (or the
 * prompt to upload a registration), documents and Add Branch only inside an approved business;
 * Add Business at the top (G5 gate), whose first branch is held until approval.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BusinessesPage from '@/app/(dashboard)/gym/businesses/page'
import { hostApi } from '@/lib/api/host'
import { organizationsApi } from '@/lib/api/organizations'
import { meApi, MyContext } from '@/lib/api/me'
import { apiError, ok } from '../fixtures/team'
import { ownerContext, orgAdminContext } from '../fixtures/context'
import { fakePlaces, pickPlace } from '../fixtures/places'
import { addPhotos, fakeStagingUploads, PHOTO_URLS } from '../fixtures/branch-form'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/components/features/map-picker', () => ({ MapPicker: () => <div /> }))
const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

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

const LIVE = {
  id: 'biz-1', name: 'Iron House', status: 'ACTIVE', kycStatus: 'APPROVED', canReceiveBranches: true,
  businessVerified: true, branchCount: 2, missingForApproval: [], heldFirstBranch: false,
}
const PENDING = {
  id: 'biz-2', name: 'Peak Fitness', status: 'PENDING', kycStatus: 'PENDING', canReceiveBranches: false,
  businessVerified: false, branchCount: 0, missingForApproval: ['PROOF_OF_PREMISES'], heldFirstBranch: true,
}
const BRANCHES: Record<string, unknown[]> = {
  'biz-1': [
    { id: 'b1', branchName: 'Uptown', status: 'ACTIVE', businessId: 'biz-1' },
    { id: 'b2', branchName: 'DHA Phase 5', status: 'ACTIVE', businessId: 'biz-1' },
  ],
  'biz-2': [],
}

let createBusiness: ReturnType<typeof vi.spyOn>
let businessQuota: ReturnType<typeof vi.spyOn>

const mount = (context: MyContext = ownerContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <BusinessesPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'GYM_HOST'
  toast.mockReset()
  fakePlaces()
  fakeStagingUploads()
  vi.spyOn(organizationsApi, 'getMine').mockResolvedValue(ok({ organization: { id: 'org-1', status: 'ACTIVE', organizationName: 'Khan Fitness Ltd' }, subscription: null }) as never)
  vi.spyOn(hostApi, 'getBusinesses').mockResolvedValue(ok([LIVE, PENDING]) as never)
  vi.spyOn(hostApi, 'getBusinessBranches').mockImplementation((async (id: string) => ok({ branches: BRANCHES[id] ?? [] })) as never)
  vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 4, usedBranches: 3, remainingBranches: 1, activeBranches: 2, buildableBranches: 1, overQuotaCount: 0, pool: { max: 4, used: 3, reserved: 1, free: 1 } }) as never)
  businessQuota = vi.spyOn(hostApi, 'getBusinessQuota').mockResolvedValue(ok({ pool: { max: 4, used: 3, reserved: 1, free: 1 }, canAddBusiness: true, blockingBusinessStatus: null }) as never)
  createBusiness = vi.spyOn(hostApi, 'createBusiness').mockResolvedValue(ok({ business: { ...PENDING, id: 'biz-3', name: 'Core Gym' }, branch: null, heldFirstBranch: true }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Businesses page: the hierarchy', () => {
  it('shows the organization name and the one pool of branches', async () => {
    mount()
    expect(await screen.findByText('Khan Fitness Ltd')).toBeInTheDocument()
    expect(screen.getByText('3 of 4 branches used, 1 reserved')).toBeInTheDocument()
  })

  it('one card per business with its branches; the status chip, verified check and held branch say where it stands', async () => {
    mount()
    const live = await screen.findByTestId('business-card-biz-1')
    expect(within(live).getByTestId('business-chip')).toHaveTextContent('Live')
    expect(within(live).getByTestId('verified-check')).toHaveAttribute('title', 'Registration document checked by GymsEra')
    expect(await within(live).findByText('Uptown')).toBeInTheDocument()
    expect(within(live).getByText('DHA Phase 5')).toBeInTheDocument()
    expect(within(live).getByRole('button', { name: /add branch/i })).toBeInTheDocument()

    const pending = screen.getByTestId('business-card-biz-2')
    expect(within(pending).getByTestId('business-chip')).toHaveTextContent('Needs documents')
    expect(within(pending).queryByTestId('verified-check')).toBeNull()
    expect(within(pending).getByTestId('get-verified')).toHaveTextContent('Upload your registration to get Verified')
    expect(within(pending).getByTestId('missing-for-approval')).toHaveTextContent('Proof of premises')
    expect(within(pending).getByTestId('held-first-branch')).toBeInTheDocument()
    // D7: a business under review cannot receive branches.
    expect(within(pending).queryByRole('button', { name: /add branch/i })).toBeNull()
  })

  it('Add Branch from a card opens on that business and lists the one under review as disabled', async () => {
    mount()
    const live = await screen.findByTestId('business-card-biz-1')
    fireEvent.click(within(live).getByRole('button', { name: /add branch/i }))
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText(/^business/i) as HTMLSelectElement).value).toBe('biz-1')
    expect((within(dialog).getByRole('option', { name: 'Peak Fitness (Under review)' }) as HTMLOptionElement).disabled).toBe(true)
  })

  it('someone who is not the owner is told who manages businesses, and nothing is fetched', async () => {
    accountRole = 'MEMBER'
    mount(orgAdminContext)
    expect(await screen.findByText('Only the owner manages businesses')).toBeInTheDocument()
    expect(hostApi.getBusinesses).not.toHaveBeenCalled()
  })
})

describe('Businesses page: Add Business (first branch held until approval)', () => {
  const fill = async (dialog: HTMLElement) => {
    fireEvent.change(within(dialog).getByLabelText(/business name/i), { target: { value: 'Core Gym' } })
    await pickPlace('City', 'Lah', /Lahore/, dialog)
    await pickPlace('Area', 'Gul', /Gulberg/, dialog)
    fireEvent.change(within(dialog).getByLabelText('Address', { exact: true }), { target: { value: '12 Mall Road' } })
    await addPhotos(dialog)
    fireEvent.change(within(dialog).getByLabelText(/first plan/i), { target: { value: 'Monthly' } })
    fireEvent.change(within(dialog).getByLabelText(/^price/i), { target: { value: '3000' } })
  }

  it('sends the business with its first branch to POST /host/businesses and says it waits for review', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /add business/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Opens')).toHaveValue('06:00')
    expect(within(dialog).getByLabelText('Closes')).toHaveValue('22:00')
    await fill(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: /submit for review/i }))

    await waitFor(() => expect(createBusiness).toHaveBeenCalledTimes(1))
    const body = createBusiness.mock.calls[0][0] as Record<string, unknown>
    expect(body).toMatchObject({ businessName: 'Core Gym', cityId: 7, areaId: 70, address: '12 Mall Road', openingTime: '06:00', closingTime: '22:00', images: PHOTO_URLS })
    // Contract v2: no branchSource, no copied logo or cover (F9), no old keys.
    expect(body).not.toHaveProperty('branchSource')
    expect(body).not.toHaveProperty('logoUrl')
    expect(body).not.toHaveProperty('gymName')
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Business submitted for review' })))
  })

  it('Submit waits for an area and 3 photos', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /add business/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/business name/i), { target: { value: 'Core Gym' } })
    const missing = within(dialog).getByTestId('add-business-missing')
    expect(missing).toHaveTextContent('Area')
    expect(missing).toHaveTextContent('At least 3 photos')
    expect(within(dialog).getByRole('button', { name: /submit for review/i })).toBeDisabled()
  })

  it('403 branch_limit_reached: the upsell, then "Try again" sends the same business again', async () => {
    createBusiness.mockRejectedValueOnce(apiError(403, 'Branch limit reached for your current plan.', 'branch_limit_reached'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /add business/i }))
    const dialog = await screen.findByRole('dialog')
    await fill(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: /submit for review/i }))
    expect(await screen.findByText('One more branch needed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(createBusiness).toHaveBeenCalledTimes(2))
    expect(createBusiness.mock.calls[1][0]).toEqual(createBusiness.mock.calls[0][0])
  })

  it.each([
    ['DRAFT', 'Finish and submit your current business before adding another.'],
    ['PENDING', 'Your current business must be approved before you can add another.'],
  ])('blocked while another business is %s (G5 canAddBusiness / blockingBusinessStatus)', async (status, message) => {
    businessQuota.mockResolvedValue(ok({ pool: { max: 4, used: 3, reserved: 1, free: 1 }, canAddBusiness: false, blockingBusinessStatus: status }) as never)
    mount()
    expect(await screen.findByTestId('add-business-blocked')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: /add business/i })).toBeDisabled()
  })
})

describe('Businesses page: documents (D10) and the verified badge (D11)', () => {
  it('uploads proof of premises with its document type; registration is optional', async () => {
    vi.spyOn(hostApi, 'getBusinessDocuments').mockResolvedValue(ok([]) as never)
    const upload = vi.spyOn(hostApi, 'uploadBusinessDocuments').mockResolvedValue(ok([]) as never)
    mount()
    const pending = await screen.findByTestId('business-card-biz-2')
    fireEvent.click(within(pending).getByRole('button', { name: /documents/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('doc-kind-PROOF_OF_PREMISES')).toHaveTextContent('Proof of premises *')
    expect(within(dialog).getByTestId('doc-kind-BUSINESS_REGISTRATION')).toHaveTextContent('Registration (optional)')
    expect(dialog).toHaveTextContent('Upload your registration to get Verified')

    const file = new File(['%PDF'], 'lease.pdf', { type: 'application/pdf' })
    fireEvent.change(within(dialog).getByLabelText('Upload Proof of premises'), { target: { files: [file] } })
    await waitFor(() => expect(upload).toHaveBeenCalledWith('biz-2', 'PROOF_OF_PREMISES', [file]))
  })
})
