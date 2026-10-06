import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemberAccessPanel } from '@/components/features/team/member-access-panel'
import { teamApi } from '@/lib/api/team'
import { gymApi } from '@/lib/api/gym'
import { apiError, branches, catalogue, deskDetail, ok, rolesForManager, rolesForOwner } from '../fixtures/team'

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-me' }, isGymHost: true }),
}))

const renderPanel = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemberAccessPanel assignmentId="asg-desk" onClose={vi.fn()} />
    </QueryClientProvider>
  )
}

const mockMeta = (roles = rolesForOwner, me = { myLevel: 100, isOwner: true }) => {
  vi.spyOn(teamApi, 'getRoles').mockResolvedValue(ok({ roles, ...me }) as never)
  vi.spyOn(teamApi, 'getPermissionCatalogue').mockResolvedValue(ok({ modules: catalogue }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches }) as never)
}

const row = (permissionKey: string) => document.querySelector(`[data-permission="${permissionKey}"]`) as HTMLElement

/** Stage "Add a member" → Direct and walk through the diff to Confirm. */
const changeAddMemberToDirectAndConfirm = async () => {
  await screen.findByText('Add a member')
  fireEvent.click(within(row('members.create')).getByRole('button', { name: 'Direct' }))
  fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
}

describe('MemberAccessPanel — permission editor (UX-12)', () => {
  beforeEach(() => mockMeta())
  afterEach(() => vi.restoreAllMocks())

  it('shows the three choices for an approvable permission, with the server tier selected', async () => {
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(deskDetail) as never)
    renderPanel()

    await screen.findByText('Add a member')
    const group = within(row('members.create'))
    expect(group.getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'false')
    expect(group.getByRole('button', { name: 'Needs approval' })).toHaveAttribute('aria-pressed', 'true')
    expect(group.getByRole('button', { name: 'Direct' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows a role-preset tier as a read-only label and never writes it when saving (RBAC-01)', async () => {
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(deskDetail) as never)
    const save = vi
      .spyOn(teamApi, 'setPermissions')
      .mockResolvedValue(ok({ ...deskDetail, version: 4 }) as never)
    renderPanel()

    await screen.findByText('View members')
    expect(within(row('members.view')).getByText('View only · from Front Desk role')).toBeInTheDocument()
    expect(within(row('members.view')).queryByRole('switch')).not.toBeInTheDocument()

    await changeAddMemberToDirectAndConfirm()

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const sent = save.mock.calls[0][1]
    expect(sent.map((o) => o.permissionKey).sort()).toEqual(['members.create', 'members.create.direct'])
  })

  it('shows only the changed rows, before and after, and sends nothing until confirmed', async () => {
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(deskDetail) as never)
    const save = vi.spyOn(teamApi, 'setPermissions').mockResolvedValue(ok({ ...deskDetail, version: 4 }) as never)
    renderPanel()

    await screen.findByText('Add a member')
    fireEvent.click(within(row('members.create')).getByRole('button', { name: 'Direct' }))
    expect(screen.getByText('1 change to review')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Confirm changes for Sana Malik')).toBeInTheDocument()
    const changes = within(within(dialog).getByRole('list', { name: 'Changes' })).getAllByRole('listitem')
    expect(changes).toHaveLength(1)
    expect(changes[0]).toHaveTextContent('Add a member')
    expect(changes[0]).toHaveTextContent('Needs approval → Direct')
    expect(save).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(save).not.toHaveBeenCalled()
  })

  it('sends the whole override set with expectedVersion (RBAC-08)', async () => {
    const withOverride = {
      ...deskDetail,
      overrides: [{ permissionKey: 'attendance.checkin', effect: 'DENY' as const, dataScope: null, branchId: null }],
      effectivePermissions: ['members.view', 'members.create'],
    }
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(withOverride) as never)
    const save = vi.spyOn(teamApi, 'setPermissions').mockResolvedValue(ok({ ...withOverride, version: 4 }) as never)
    renderPanel()

    await changeAddMemberToDirectAndConfirm()

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const [assignmentId, overrides, expectedVersion] = save.mock.calls[0]
    expect(assignmentId).toBe('asg-desk')
    expect(expectedVersion).toBe(3)
    // The untouched override is sent again: the server replaces the set.
    expect(overrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ permissionKey: 'attendance.checkin', effect: 'DENY' }),
        expect.objectContaining({ permissionKey: 'members.create', effect: 'ALLOW' }),
        expect.objectContaining({ permissionKey: 'members.create.direct', effect: 'ALLOW' }),
      ])
    )
    expect(overrides).toHaveLength(3)
  })

  it('on 409 grants_changed reloads the member, says so, and drops the stale edit (RBAC-08)', async () => {
    const afterOtherSave = {
      ...deskDetail,
      version: 4,
      overrides: [{ permissionKey: 'members.create', effect: 'DENY' as const, dataScope: null, branchId: null }],
      effectivePermissions: ['members.view', 'attendance.checkin'],
    }
    const getMember = vi
      .spyOn(teamApi, 'getMember')
      .mockResolvedValueOnce(ok(deskDetail) as never)
      .mockResolvedValue(ok(afterOtherSave) as never)
    const save = vi
      .spyOn(teamApi, 'setPermissions')
      .mockRejectedValue(
        apiError(409, 'This team member was modified by another user. Reload and try again.', 'grants_changed')
      )
    renderPanel()

    await changeAddMemberToDirectAndConfirm()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))

    // Reloaded from the server.
    await waitFor(() => expect(getMember).toHaveBeenCalledTimes(2))

    // A clear message that stays on screen.
    const notice = await screen.findByTestId('grants-changed-notice')
    expect(notice).toHaveTextContent(/someone else changed sana malik's access/i)
    expect(notice).toHaveTextContent(/latest version/i)

    // The other person's change is now shown, and the stale edit is gone.
    await waitFor(() =>
      expect(within(row('members.create')).getByRole('button', { name: 'Off' })).toHaveAttribute('aria-pressed', 'true')
    )
    expect(screen.queryByText(/change to review/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // The next save uses the new version.
    save.mockResolvedValue(ok({ ...afterOtherSave, version: 5 }) as never)
    await changeAddMemberToDirectAndConfirm()
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls[1][2]).toBe(4)
  })

  it('asks before granting a sensitive permission directly', async () => {
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(deskDetail) as never)
    renderPanel()

    await screen.findByText('Delete a member')
    fireEvent.click(within(row('members.delete')).getByRole('button', { name: 'Direct' }))

    expect(await screen.findByText('Grant direct access?')).toBeInTheDocument()
    // The open dialog hides the page behind it from the accessibility tree.
    expect(within(row('members.delete')).getByRole('button', { name: 'Direct', hidden: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Grant direct access' }))
    await waitFor(() =>
      expect(within(row('members.delete')).getByRole('button', { name: 'Direct' })).toHaveAttribute('aria-pressed', 'true')
    )
  })
})

describe('MemberAccessPanel — role and branches (RBAC-05, RBAC-08)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('disables roles at or above the signed-in user’s level and says why', async () => {
    mockMeta(rolesForManager, { myLevel: 60, isOwner: false })
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(deskDetail) as never)
    renderPanel()

    const select = (await screen.findByLabelText('Role')) as HTMLSelectElement
    const option = (name: RegExp) => within(select).getByRole('option', { name }) as HTMLOptionElement

    expect(option(/org admin/i).disabled).toBe(true)
    expect(option(/branch manager/i).disabled).toBe(true)
    expect(option(/branch admin/i).disabled).toBe(false)
    expect(option(/front desk/i).disabled).toBe(false)
    expect(option(/trainer/i).disabled).toBe(false)
    // The owner role is never offered from the team screen.
    expect(within(select).queryByRole('option', { name: /^owner/i })).not.toBeInTheDocument()

    expect(screen.getByText('You cannot assign a role at or above your own.')).toBeInTheDocument()
  })

  it('sends expectedVersion with a role change', async () => {
    mockMeta()
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(deskDetail) as never)
    const update = vi
      .spyOn(teamApi, 'updateMember')
      .mockResolvedValue(ok({ id: 'asg-desk', roleKey: 'TRAINER', status: 'ACTIVE', version: 4 }) as never)
    renderPanel()

    fireEvent.change(await screen.findByLabelText('Role'), { target: { value: 'TRAINER' } })
    fireEvent.click(screen.getByRole('button', { name: /save role & branches/i }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith('asg-desk', {
      roleKey: 'TRAINER',
      assignToAllBranches: false,
      branchIds: ['branch-1'],
      expectedVersion: 3,
    })
  })

  it('shows the server’s reason when it refuses a role with 403', async () => {
    mockMeta()
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(ok(deskDetail) as never)
    vi.spyOn(teamApi, 'updateMember').mockRejectedValue(
      apiError(403, 'You cannot assign the Branch Admin role — it is at or above your own level')
    )
    renderPanel()

    fireEvent.change(await screen.findByLabelText('Role'), { target: { value: 'BR_ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: /save role & branches/i }))

    const alert = await screen.findByTestId('role-error')
    expect(alert).toHaveTextContent('You cannot assign the Branch Admin role — it is at or above your own level')
    // Nothing is assumed: the role shown goes back to what the server last confirmed.
    await waitFor(() => expect((screen.getByLabelText('Role') as HTMLSelectElement).value).toBe('DESK'))
  })

  it('on 409 grants_changed for a role change, reloads and says so', async () => {
    mockMeta()
    const getMember = vi
      .spyOn(teamApi, 'getMember')
      .mockResolvedValueOnce(ok(deskDetail) as never)
      .mockResolvedValue(ok({ ...deskDetail, version: 4, role: { key: 'TRAINER', name: 'Trainer', level: 20 } }) as never)
    vi.spyOn(teamApi, 'updateMember').mockRejectedValue(
      apiError(409, 'This team member was modified by another user. Reload and try again.', 'grants_changed')
    )
    renderPanel()

    fireEvent.change(await screen.findByLabelText('Role'), { target: { value: 'BR_ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: /save role & branches/i }))

    expect(await screen.findByTestId('grants-changed-notice')).toBeInTheDocument()
    await waitFor(() => expect(getMember).toHaveBeenCalledTimes(2))
    await waitFor(() => expect((screen.getByLabelText('Role') as HTMLSelectElement).value).toBe('TRAINER'))
  })

  it('locks the panel for someone at or above the signed-in user’s level', async () => {
    mockMeta(rolesForManager, { myLevel: 60, isOwner: false })
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(
      ok({ ...deskDetail, role: { key: 'MANAGER', name: 'Branch Manager', level: 60 } }) as never
    )
    renderPanel()

    expect(await screen.findByText('You cannot manage a team member at or above your own level.')).toBeInTheDocument()
    expect(screen.getByLabelText('Role')).toBeDisabled()
    expect(within(row('members.create')).getByRole('button', { name: 'Direct' })).toBeDisabled()
  })

  it('shows the owner notice instead of an editor for the owner', async () => {
    mockMeta()
    vi.spyOn(teamApi, 'getMember').mockResolvedValue(
      ok({
        ...deskDetail,
        fullName: 'Hira Khan',
        role: { key: 'OWNER', name: 'Owner', level: 100 },
        effectivePermissions: ['*'],
      }) as never
    )
    renderPanel()

    expect(await screen.findByText('Hira Khan owns this organization')).toBeInTheDocument()
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument()
  })
})
