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

const live = { id: 'b1', branchName: 'Uptown Gym', status: 'ACTIVE', address: 'x', gymListingId: 'listing-1' }
const deleted = { id: 'b7', branchName: 'Old Gym', status: 'INACTIVE', address: 'y', gymListingId: 'listing-1' }
const quota = { maxBranches: 6, usedBranches: 5, remainingBranches: 1, activeBranches: 5, buildableBranches: 1, overQuotaCount: 0 }

let getQuota: ReturnType<typeof vi.spyOn>
let deleteBranch: ReturnType<typeof vi.spyOn>
let restoreBranch: ReturnType<typeof vi.spyOn>

const mount = (context: MyContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
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
  vi.spyOn(citiesApi, 'getCities').mockResolvedValue(ok([]) as never)
  vi.spyOn(hostApi, 'getListings').mockResolvedValue(ok([{ id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }]) as never)
  vi.spyOn(hostApi, 'getListingBranches').mockImplementation((async (_id: string, includeInactive?: boolean) =>
    ok({ branches: includeInactive ? [live, deleted] : [live] })) as never)
  getQuota = vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue(ok(quota) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [live] }) as never)
  deleteBranch = vi.spyOn(hostApi, 'deleteBranch').mockResolvedValue(ok(null) as never)
  restoreBranch = vi.spyOn(hostApi, 'restoreBranch').mockResolvedValue(ok({}) as never)
})
afterEach(() => vi.restoreAllMocks())

const startDelete = async () => {
  await screen.findByText('Uptown Gym')
  fireEvent.click(await screen.findByText(/deactivate/i))
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.change(within(dialog).getByLabelText(/account password/i), { target: { value: 'placeholder-pass' } })
  fireEvent.click(within(dialog).getByRole('button', { name: /^delete branch$/i }))
}

describe('Delete branch — re-auth and the last-branch 409 (UX-19)', () => {
  it('sends the owner’s password to DELETE /host/branches/:id and refreshes capacity', async () => {
    mount(ownerContext)
    await screen.findByText('5 of 6 branches used')
    await startDelete()

    await waitFor(() => expect(deleteBranch).toHaveBeenCalledWith('b1', { password: 'placeholder-pass' }))
    await waitFor(() => expect(getQuota.mock.calls.length).toBeGreaterThan(1))
  })

  it('wrong password (401 invalid_credentials): the reason stays in the dialog and the branch is kept', async () => {
    deleteBranch.mockRejectedValueOnce(apiError(401, 'Invalid password or credentials.', 'invalid_credentials'))
    mount(ownerContext)
    await startDelete()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Invalid password or credentials.')
    expect(screen.getByText('Uptown Gym')).toBeInTheDocument()
    expect(screen.queryByText('Last branch in this organization')).not.toBeInTheDocument()
  })

  it('re-auth required (401 reauth_required): says the password must be confirmed', async () => {
    deleteBranch.mockRejectedValueOnce(apiError(401, '', 'reauth_required'))
    mount(ownerContext)
    await startDelete()

    expect(await screen.findByRole('alert')).toHaveTextContent('Please confirm your password to complete this sensitive action.')
  })

  const lastBranch = () =>
    Object.assign(apiError(409, 'This is the last branch in this organization.', 'last_branch_in_organization'), {
      response: {
        status: 409,
        data: { success: false, code: 'last_branch_in_organization', message: 'last', data: { organizationName: 'Iron Gym' } },
      },
    })

  it('409 last_branch_in_organization: asks first, with the mobile wording, and sends nothing more until confirmed', async () => {
    deleteBranch.mockRejectedValueOnce(lastBranch())
    mount(ownerContext)
    await startDelete()

    expect(await screen.findByText('Last branch in this organization')).toBeInTheDocument()
    expect(screen.getByText(/"Uptown Gym" is the last branch in "Iron Gym"\./)).toBeInTheDocument()
    expect(screen.getByText(/Continuing will also remove "Iron Gym", because an organization can't exist without a branch\./)).toBeInTheDocument()
    expect(screen.getByText(/The branch capacity you paid for is not lost/)).toBeInTheDocument()
    expect(deleteBranch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    await waitFor(() => expect(screen.queryByText('Last branch in this organization')).not.toBeInTheDocument())
    expect(deleteBranch).toHaveBeenCalledTimes(1)
  })

  it('confirming sends the same credentials again with confirmOrganizationDeletion', async () => {
    deleteBranch.mockRejectedValueOnce(lastBranch())
    mount(ownerContext)
    await startDelete()
    fireEvent.click(await screen.findByRole('button', { name: /delete anyway/i }))

    await waitFor(() => expect(deleteBranch).toHaveBeenCalledTimes(2))
    expect(deleteBranch).toHaveBeenLastCalledWith('b1', { password: 'placeholder-pass', confirmOrganizationDeletion: true })
    await waitFor(() => expect(screen.queryByText('Last branch in this organization')).not.toBeInTheDocument())
    // The organization went too: its list is read again.
    await waitFor(() => expect(hostApi.getListings.mock.calls.length).toBeGreaterThan(1))
  })

  it('someone who is not the owner has no delete action (the route is owner-only)', async () => {
    accountRole = 'MEMBER'
    mount(orgAdminContext)
    await screen.findByText('Uptown Gym')
    expect(screen.queryByText(/deactivate/i)).not.toBeInTheDocument()
  })
})

describe('Restore branch (mobile listing_branches_screen)', () => {
  it('lists the organization’s deleted branches and restores one after a confirmation', async () => {
    mount(ownerContext)
    expect(await screen.findByText('Deleted branches')).toBeInTheDocument()
    expect(hostApi.getListingBranches).toHaveBeenCalledWith('listing-1', true)

    fireEvent.click(await screen.findByRole('button', { name: /restore old gym/i }))
    expect(await screen.findByText('Restore Branch?')).toBeInTheDocument()
    expect(screen.getByText(/"Old Gym" will reopen with its profile, photos, reviews and history intact\. It uses one unit of your branch capacity again\./)).toBeInTheDocument()
    expect(screen.getByText(/Members and staff are not automatically restored/)).toBeInTheDocument()
    expect(restoreBranch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^restore$/i }))
    await waitFor(() => expect(restoreBranch).toHaveBeenCalledWith('b7'))
    await waitFor(() => expect(getQuota.mock.calls.length).toBeGreaterThan(1))
  })

  it('cancelling restores nothing', async () => {
    mount(ownerContext)
    fireEvent.click(await screen.findByRole('button', { name: /restore old gym/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }))
    expect(restoreBranch).not.toHaveBeenCalled()
  })

  it('403 branch_limit_reached: the upsell, then "Try again" restores the same branch', async () => {
    restoreBranch.mockRejectedValueOnce(apiError(403, 'Branch limit reached for your current plan.', 'branch_limit_reached'))
    mount(ownerContext)
    fireEvent.click(await screen.findByRole('button', { name: /restore old gym/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^restore$/i }))

    expect(await screen.findByText('One more branch needed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /continue in the gymsera app/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(restoreBranch).toHaveBeenCalledTimes(2))
    expect(restoreBranch).toHaveBeenLastCalledWith('b7')
  })

  it('any other refusal shows its reason in the list', async () => {
    restoreBranch.mockRejectedValueOnce(apiError(409, 'This branch is locked by your plan.', 'branch_billing_locked'))
    mount(ownerContext)
    fireEvent.click(await screen.findByRole('button', { name: /restore old gym/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^restore$/i }))

    expect(await screen.findByTestId('restore-error')).toHaveTextContent(/locked due to plan limits/i)
  })

  it('is not offered to someone who is not the owner', async () => {
    accountRole = 'MEMBER'
    mount(orgAdminContext)
    await screen.findByText('Uptown Gym')
    expect(screen.queryByText('Deleted branches')).not.toBeInTheDocument()
  })
})
