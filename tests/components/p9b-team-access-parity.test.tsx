import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TeamPage from '@/app/(dashboard)/gym/team/page'
import { InviteMemberDialog } from '@/components/features/team/invite-member-dialog'
import { teamApi } from '@/lib/api/team'
import { gymApi } from '@/lib/api/gym'
import { catalogue, ok, rolesForOwner } from '../fixtures/team'

/**
 * Phase 7 P9b item 3: Team & Access parity with the app (team_access_screen.dart,
 * add_team_member_screen.dart). Before:
 * - a failed team load was an empty state with the message and an always-present "Try again", no
 *   request reference (the app shows ErrorStateView: reference, retry only when it can help);
 *   a host whose gym is not live (409 tenant_not_active) was offered a retry that cannot work;
 * - the invite dialog's roles error was a bare alert with no retry and no reference;
 * - its branch step had no loading, error or empty state, and offered deleted (INACTIVE) branches,
 *   while the app offers only active ones (host_providers.dart hostBranchesProvider).
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'user-me' }, isGymHost: true }) }))
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

const failure = (status: number, code: string, requestId = 'req-team-1', message = 'Something went wrong') => ({
  response: { status, data: { success: false, message, code, requestId } },
})

const withClient = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      {ui}
    </QueryClientProvider>
  )

beforeEach(() => {
  vi.spyOn(teamApi, 'getRoles').mockResolvedValue(ok({ roles: rolesForOwner, myLevel: 100, isOwner: true }) as never)
  vi.spyOn(teamApi, 'getPermissionCatalogue').mockResolvedValue(ok({ modules: catalogue }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [
    { id: 'branch-1', branchName: 'Uptown', status: 'ACTIVE' },
    { id: 'branch-2', branchName: 'Downtown', status: 'ACTIVE' },
    { id: 'branch-9', branchName: 'Old Mall', status: 'INACTIVE' },
  ] }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Team & Access: error states (app ErrorStateView)', () => {
  it('a server failure shows the request reference and a Retry that reloads', async () => {
    const getTeam = vi.spyOn(teamApi, 'getTeam').mockRejectedValue(failure(500, 'internal_error', 'req-500'))
    withClient(<TeamPage />)
    const state = await screen.findByTestId('error-state')
    expect(within(state).getByText('req-500')).toBeInTheDocument()
    fireEvent.click(within(state).getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(getTeam).toHaveBeenCalledTimes(2))
  })

  it('a gym that is not live gets the plain copy and no retry that cannot work', async () => {
    // The API's own sentence (tenantContext.js), the same as the shared copy.
    vi.spyOn(teamApi, 'getTeam').mockRejectedValue(failure(409, 'tenant_not_active', 'req-409', 'Your gym is not live yet. Finish setting it up to use this.'))
    withClient(<TeamPage />)
    const state = await screen.findByTestId('error-state')
    expect(within(state).getByText('Your gym is not live yet. Finish setting it up to use this.')).toBeInTheDocument()
    expect(within(state).getByText('req-409')).toBeInTheDocument()
    expect(within(state).queryByRole('button', { name: /retry|try again/i })).not.toBeInTheDocument()
  })
})

describe('Add team member: roles and branches (app add_team_member_screen.dart)', () => {
  const toRoleStep = () => {
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'new.person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  }
  const toBranchStep = async () => {
    toRoleStep()
    fireEvent.click(await screen.findByRole('radio', { name: /front desk/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  }

  it('a failed roles load shows the reference and a Retry', async () => {
    const getRoles = vi.spyOn(teamApi, 'getRoles').mockRejectedValue(failure(503, 'internal_error', 'req-roles'))
    withClient(<InviteMemberDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />)
    toRoleStep()
    const state = await screen.findByTestId('error-state')
    expect(within(state).getByText('req-roles')).toBeInTheDocument()
    fireEvent.click(within(state).getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(getRoles.mock.calls.length).toBeGreaterThan(1))
  })

  it('only active branches are offered; a deleted branch is not', async () => {
    withClient(<InviteMemberDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />)
    await toBranchStep()
    expect(await screen.findByLabelText('Downtown')).toBeInTheDocument()
    expect(screen.getByLabelText('Uptown')).toBeInTheDocument()
    expect(screen.queryByLabelText('Old Mall')).not.toBeInTheDocument()
  })

  it('a failed branches load shows an error state with Retry, not an empty list', async () => {
    const getBranches = vi.spyOn(gymApi, 'getBranches').mockRejectedValue(failure(500, 'internal_error', 'req-br'))
    withClient(<InviteMemberDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />)
    await toBranchStep()
    const state = await screen.findByTestId('error-state')
    expect(within(state).getByText('req-br')).toBeInTheDocument()
    fireEvent.click(within(state).getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(getBranches.mock.calls.length).toBeGreaterThan(1))
  })

  it('no branch yet: says so, and All branches still works', async () => {
    vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches: [] }) as never)
    withClient(<InviteMemberDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />)
    await toBranchStep()
    expect(await screen.findByText(/no branches yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'All branches' }))
    expect(screen.getByRole('button', { name: 'Add to team' })).not.toBeDisabled()
  })
})
