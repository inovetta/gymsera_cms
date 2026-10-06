import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TeamPage from '@/app/(dashboard)/gym/team/page'
import { RoleFilterChips } from '@/components/features/team/role-filter-chips'
import { InviteMemberDialog } from '@/components/features/team/invite-member-dialog'
import { teamApi, TeamMember } from '@/lib/api/team'
import { gymApi } from '@/lib/api/gym'
import {
  apiError,
  branches,
  catalogue,
  deskDetail,
  deskMember,
  managerMember,
  ok,
  ownerMember,
  rolesForManager,
  rolesForOwner,
} from '../fixtures/team'

let memberParam: string | null = null

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'member' ? memberParam : null) }),
}))

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid="header" />,
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-me' }, isGymHost: true }),
}))

const withClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

const secondDesk: TeamMember = { ...deskMember, id: 'asg-desk-2', userId: 'user-desk-2', fullName: 'Omar Raza', email: 'omar@example.test' }
const team = [ownerMember, managerMember, deskMember, secondDesk]

const mockTeam = (members: TeamMember[] = team) =>
  vi.spyOn(teamApi, 'getTeam').mockResolvedValue(ok({ team: members, counts: {}, total: members.length }) as never)

beforeEach(() => {
  memberParam = null
  vi.spyOn(teamApi, 'getRoles').mockResolvedValue(ok({ roles: rolesForOwner, myLevel: 100, isOwner: true }) as never)
  vi.spyOn(teamApi, 'getPermissionCatalogue').mockResolvedValue(ok({ modules: catalogue }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('RoleFilterChips (UX-12)', () => {
  it('shows a live count per role, most senior first, and hides roles nobody holds', () => {
    render(<RoleFilterChips team={team} selected={null} onSelect={vi.fn()} />)

    const chips = within(screen.getByRole('group', { name: /filter by role/i })).getAllByRole('button')
    expect(chips.map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'All 4',
      'Owner 1',
      'Branch Manager 1',
      'Front Desk 2',
    ])
    // Nobody is a Trainer, Branch Admin or Support here: no empty chips.
    expect(screen.queryByRole('button', { name: /trainer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /support/i })).not.toBeInTheDocument()
  })

  it('selects a role, and clicking the selected chip clears the filter', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<RoleFilterChips team={team} selected={null} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /front desk/i }))
    expect(onSelect).toHaveBeenLastCalledWith('DESK')

    rerender(<RoleFilterChips team={team} selected="DESK" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /front desk/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /front desk/i }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
})

describe('TeamPage (UX-12)', () => {
  it('lists the team from GET /team and filters by role chip and search', async () => {
    const getTeam = mockTeam()
    withClient(<TeamPage />)

    expect(await screen.findByText('Sana Malik')).toBeInTheDocument()
    expect(getTeam).toHaveBeenCalledWith(undefined)
    expect(screen.getAllByRole('row')).toHaveLength(1 + 4)

    fireEvent.click(screen.getByRole('button', { name: /front desk/i }))
    expect(screen.getAllByRole('row')).toHaveLength(1 + 2)
    expect(screen.queryByText('Bilal Ahmed')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search team'), { target: { value: 'omar' } })
    expect(screen.getAllByRole('row')).toHaveLength(1 + 1)
    expect(screen.getByText('Omar Raza')).toBeInTheDocument()
  })

  it('shows the empty state with the mobile wording when nobody is on the team', async () => {
    mockTeam([])
    withClient(<TeamPage />)

    expect(await screen.findByText('No team members yet')).toBeInTheDocument()
    expect(screen.getByText('Add a manager, admin, front desk clerk, trainer or support staff.')).toBeInTheDocument()
  })

  it('shows a forbidden state, not an error with retry, when the server answers 403', async () => {
    vi.spyOn(teamApi, 'getTeam').mockRejectedValue(apiError(403, 'You do not have permission to view the team here'))
    withClient(<TeamPage />)

    expect(await screen.findByText('You do not have access to the team')).toBeInTheDocument()
    expect(screen.getByText('You do not have permission to view the team here')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('shows an error state with Try again when the list fails for another reason', async () => {
    const getTeam = vi.spyOn(teamApi, 'getTeam').mockRejectedValue(apiError(500, 'Server error'))
    withClient(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: /try again/i }))
    await waitFor(() => expect(getTeam).toHaveBeenCalledTimes(2))
  })

  it('revokes with DELETE /team/:id after a confirmation that says the record is kept', async () => {
    mockTeam()
    const revoke = vi.spyOn(teamApi, 'revokeMember').mockResolvedValue(ok(null) as never)
    withClient(<TeamPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke access for Sana Malik' }))

    expect(await screen.findByText('Revoke access?')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Sana Malik will immediately lose access to uptown. Their record is kept so past approvals and payments stay traceable.'
      )
    ).toBeInTheDocument()
    expect(revoke).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }))
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('asg-desk'))
  })

  it('offers no revoke action for the owner', async () => {
    mockTeam()
    withClient(<TeamPage />)

    await screen.findByText('Hira Khan')
    expect(screen.queryByRole('button', { name: 'Revoke access for Hira Khan' })).not.toBeInTheDocument()
  })

  it('keeps revoked records: "Show revoked" lists them with Restore access, outside the chip counts', async () => {
    const revoked: TeamMember = { ...secondDesk, status: 'REVOKED' }
    const getTeam = vi.spyOn(teamApi, 'getTeam').mockImplementation((async (params?: { includeRevoked?: boolean }) =>
      ok({
        team: params?.includeRevoked ? [ownerMember, deskMember, revoked] : [ownerMember, deskMember],
        counts: {},
        total: 0,
      })) as never)
    withClient(<TeamPage />)

    await screen.findByText('Sana Malik')
    expect(screen.queryByText('Omar Raza')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch', { name: 'Show revoked' }))
    expect(await screen.findByText('Omar Raza')).toBeInTheDocument()
    expect(getTeam).toHaveBeenLastCalledWith({ includeRevoked: true })
    expect(screen.getByText('Revoked')).toBeInTheDocument()
    // A revoked record is history, not a member of the team.
    expect(screen.getByRole('button', { name: /front desk/i })).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: 'Restore access' }))
    expect(await screen.findByRole('heading', { name: 'Restore access' })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toHaveValue('omar@example.test')
  })

  it('opens the member named in ?member= (the link from the Trainers page)', async () => {
    memberParam = 'asg-desk'
    mockTeam()
    const getMember = vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(deskDetail) as never)
    withClient(<TeamPage />)

    expect(await screen.findByRole('complementary', { name: 'Team member access' })).toBeInTheDocument()
    await waitFor(() => expect(getMember).toHaveBeenCalledWith('asg-desk'))
  })
})

describe('InviteMemberDialog (UX-12, RBAC-05)', () => {
  const openDialog = (onAdded = vi.fn(), onOpenChange = vi.fn()) =>
    withClient(<InviteMemberDialog open onOpenChange={onOpenChange} onAdded={onAdded} />)

  const toRoleStep = async () => {
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'new.person@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('radiogroup', { name: 'Role' })
  }

  it('needs a valid email before Continue', () => {
    openDialog()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'not-an-email' } })
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.co' } })
    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled()
  })

  it('shows roles at or above the inviter’s level disabled, with the reason, and never offers Owner', async () => {
    vi.spyOn(teamApi, 'getRoles').mockResolvedValue(ok({ roles: rolesForManager, myLevel: 60, isOwner: false }) as never)
    openDialog()
    await toRoleStep()

    const roleCard = (name: RegExp) => screen.getByRole('radio', { name })
    expect(roleCard(/org admin/i)).toBeDisabled()
    expect(roleCard(/branch manager/i)).toBeDisabled()
    expect(roleCard(/branch admin/i)).not.toBeDisabled()
    expect(roleCard(/front desk/i)).not.toBeDisabled()
    expect(screen.queryByRole('radio', { name: /^owner/i })).not.toBeInTheDocument()
    expect(screen.getAllByText('You cannot assign a role at or above your own.')).toHaveLength(2)

    // A disabled role cannot be picked, so the flow cannot continue with it.
    fireEvent.click(roleCard(/org admin/i))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('posts the mobile payload to /team/invites and closes when an existing account was added', async () => {
    const invite = vi.spyOn(teamApi, 'invite').mockResolvedValue(
      ok({ assignmentId: 'asg-new', userId: 'u', email: 'new.person@example.test', tempPassword: null }) as never
    )
    const onAdded = vi.fn()
    const onOpenChange = vi.fn()
    openDialog(onAdded, onOpenChange)
    await toRoleStep()

    fireEvent.click(screen.getByRole('radio', { name: /front desk/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('button', { name: 'Add to team' })).toBeDisabled()
    fireEvent.click(await screen.findByLabelText('Downtown'))
    fireEvent.click(screen.getByRole('button', { name: 'Add to team' }))

    await waitFor(() => expect(invite).toHaveBeenCalledTimes(1))
    expect(invite).toHaveBeenCalledWith({
      email: 'new.person@example.test',
      roleKey: 'DESK',
      fullName: undefined,
      jobTitle: undefined,
      assignToAllBranches: false,
      branchIds: ['branch-2'],
    })
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows the temporary password once for a new account and never logs it', async () => {
    const secret = 'tmp-9f3a!Aa1'
    vi.spyOn(teamApi, 'invite').mockResolvedValue(
      ok({ assignmentId: 'asg-new', userId: 'u', email: 'new.person@example.test', tempPassword: secret }) as never
    )
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ]
    openDialog()
    await toRoleStep()
    fireEvent.click(screen.getByRole('radio', { name: /org admin/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    // Org Admin is an all-branches role: pre-selected, as on mobile.
    expect(screen.getByRole('switch', { name: 'All branches' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Add to team' }))

    expect(await screen.findByText('Account created')).toBeInTheDocument()
    expect(screen.getByTestId('temp-password')).toHaveTextContent(secret)
    for (const spy of logs) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(secret)
    }
  })

  it('shows the server’s reason when the invite is refused (403 level rule)', async () => {
    vi.spyOn(teamApi, 'invite').mockRejectedValue(
      apiError(403, 'You cannot assign the Org Admin role — it is at or above your own level')
    )
    openDialog()
    await toRoleStep()
    fireEvent.click(screen.getByRole('radio', { name: /org admin/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to team' }))

    expect(
      await screen.findByText('You cannot assign the Org Admin role — it is at or above your own level')
    ).toBeInTheDocument()
  })
})
