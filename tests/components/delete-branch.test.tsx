import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeleteBranchDialog } from '@/components/features/delete-branch-dialog'
import BranchesPage from '@/app/(dashboard)/gym/branches/page'
import { gymApi } from '@/lib/api/gym'
import { citiesApi } from '@/lib/api/cities'
import { hostApi } from '@/lib/api/host'
import { meApi } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ownerContext } from '../fixtures/context'

// Prompt 3B: deleting a branch is the owner's action and goes to the same endpoint the
// mobile app uses, DELETE /host/branches/:id. The page is rendered as the owner.
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-owner', fullName: 'Hira Khan', role: 'GYM_HOST' },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: true,
    isBranchManager: false,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid="header" />,
}))

vi.mock('@/components/features/map-picker', () => ({
  MapPicker: () => <div data-testid="map-picker" />,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}))

describe('DeleteBranchDialog (NEW-35)', () => {
  it('renders branch name, password field, and guidance for social-only accounts', () => {
    render(
      <DeleteBranchDialog
        open={true}
        onOpenChange={vi.fn()}
        branchName="Downtown Flagship"
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: /delete branch/i })).toBeInTheDocument()
    expect(screen.getByText(/Downtown Flagship/i)).toBeInTheDocument()

    const passwordInput = screen.getByLabelText(/account password/i)
    expect(passwordInput).toBeInTheDocument()
    expect(passwordInput).toHaveAttribute('type', 'password')

    // Social accounts guidance notice
    expect(screen.getByText(/social sign-in accounts/i)).toBeInTheDocument()
    expect(
      screen.getByText(/If your account only signs in with Google, please set a password/i)
    ).toBeInTheDocument()
  })

  it('keeps Delete button disabled until a password is typed', () => {
    render(
      <DeleteBranchDialog
        open={true}
        onOpenChange={vi.fn()}
        branchName="Downtown Flagship"
        onConfirm={vi.fn()}
      />
    )

    const deleteBtn = screen.getByRole('button', { name: /delete branch/i })
    expect(deleteBtn).toBeDisabled()

    const passwordInput = screen.getByLabelText(/account password/i)
    fireEvent.change(passwordInput, { target: { value: '   ' } })
    expect(deleteBtn).toBeDisabled()

    fireEvent.change(passwordInput, { target: { value: 'valid-secret-password' } })
    expect(deleteBtn).not.toBeDisabled()
  })

  it('collects and submits the entered password to onConfirm', () => {
    const handleConfirm = vi.fn()
    render(
      <DeleteBranchDialog
        open={true}
        onOpenChange={vi.fn()}
        branchName="Downtown Flagship"
        onConfirm={handleConfirm}
      />
    )

    const passwordInput = screen.getByLabelText(/account password/i)
    fireEvent.change(passwordInput, { target: { value: 'my-gym-password' } })

    const deleteBtn = screen.getByRole('button', { name: /delete branch/i })
    fireEvent.click(deleteBtn)

    expect(handleConfirm).toHaveBeenCalledWith('my-gym-password')
  })

  it('displays the server error message in the dialog when re-auth fails (401)', () => {
    render(
      <DeleteBranchDialog
        open={true}
        onOpenChange={vi.fn()}
        branchName="Downtown Flagship"
        onConfirm={vi.fn()}
        error="Invalid password or credentials."
      />
    )

    const errorAlert = screen.getByRole('alert')
    expect(errorAlert).toBeInTheDocument()
    expect(errorAlert).toHaveTextContent('Invalid password or credentials.')
  })

  it('clears password and calls onOpenChange(false) when cancelled', () => {
    const handleOpenChange = vi.fn()
    render(
      <DeleteBranchDialog
        open={true}
        onOpenChange={handleOpenChange}
        branchName="Downtown Flagship"
        onConfirm={vi.fn()}
      />
    )

    const passwordInput = screen.getByLabelText(/account password/i)
    fireEvent.change(passwordInput, { target: { value: 'temp-password' } })

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)

    expect(handleOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('BranchesPage branch delete flow (NEW-35)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the password in the delete request and keeps the branch on 401 error', async () => {
    const branches = [
      {
        id: 'branch-1',
        branchName: 'Uptown Gym',
        address: '123 Main St',
        status: 'ACTIVE',
        facilities: ['WiFi', 'Lockers'],
      },
    ]

    vi.spyOn(gymApi, 'getBranches').mockResolvedValue({
      success: true,
      data: { branches },
    } as never)

    vi.spyOn(citiesApi, 'getCities').mockResolvedValue({
      success: true,
      data: [],
    } as never)

    const error401 = {
      response: {
        status: 401,
        data: {
          success: false,
          code: 'invalid_credentials',
          message: 'Invalid password or credentials.',
        },
      },
    }
    vi.spyOn(meApi, 'getContext').mockResolvedValue({ success: true, message: 'ok', data: ownerContext } as never)
    vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue({ success: true, message: 'ok', data: { tenant: { status: 'ACTIVE' }, subscription: null } } as never)
    vi.spyOn(hostApi, 'getListings').mockResolvedValue({ success: true, message: 'ok', data: [{ id: 'listing-1', title: 'Iron Gym', status: 'ACTIVE' }] } as never)
    vi.spyOn(hostApi, 'getListingBranches').mockResolvedValue({ success: true, message: 'ok', data: { branches } } as never)
    vi.spyOn(hostApi, 'getBranchQuota').mockResolvedValue({ success: true, message: 'ok', data: { maxBranches: 6, usedBranches: 1, remainingBranches: 5, activeBranches: 1, buildableBranches: 5, overQuotaCount: 0 } } as never)
    const deleteBranchSpy = vi.spyOn(hostApi, 'deleteBranch').mockRejectedValue(error401)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <BranchesPage />
      </QueryClientProvider>
    )

    // Wait for the branch card to render
    await waitFor(() => {
      expect(screen.getByText('Uptown Gym')).toBeInTheDocument()
    })

    // Click the branch actions dropdown trigger and select Deactivate/Delete
    const moreBtn = screen.getByRole('button', { name: '' }) // MoreHorizontal button
    fireEvent.click(moreBtn)

    const deleteMenuItem = await screen.findByText(/deactivate/i)
    fireEvent.click(deleteMenuItem)

    // Delete dialog opens
    expect(screen.getByRole('heading', { name: /delete branch/i })).toBeInTheDocument()

    // Type incorrect password
    const passwordInput = screen.getByLabelText(/account password/i)
    fireEvent.change(passwordInput, { target: { value: 'wrong-password' } })

    const deleteSubmitBtn = screen.getByRole('button', { name: /delete branch/i })
    fireEvent.click(deleteSubmitBtn)

    // Verify password was passed in body to deleteBranch
    await waitFor(() => {
      expect(deleteBranchSpy).toHaveBeenCalledWith('branch-1', {
        password: 'wrong-password',
      })
    })

    // Verify 401 error message from server is shown
    await waitFor(() => {
      expect(screen.getByText('Invalid password or credentials.')).toBeInTheDocument()
    })

    // Verify the branch is STILL in the document (stays in the list)
    expect(screen.getByText('Uptown Gym')).toBeInTheDocument()
  })
})
