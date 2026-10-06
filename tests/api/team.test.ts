import { describe, it, expect, vi, afterEach } from 'vitest'
import apiClient from '@/lib/api/client'
import { teamApi } from '@/lib/api/team'
import {
  diffChanges,
  displayTier,
  isGrantsChanged,
  presetOnlyLabel,
  presetTierFor,
  savedTier,
  stageTier,
  teamErrorMessage,
  toOverrideMap,
} from '@/lib/team/access'
import { apiError, catalogue, deskDetail, rolesForOwner } from '../fixtures/team'

const perms = catalogue.flatMap((m) => m.permissions)
const perm = (key: string) => perms.find((p) => p.key === key)!
const desk = rolesForOwner.find((r) => r.key === 'DESK')

describe('teamApi — the endpoints the mobile app calls (UX-12)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reads roles, the permission catalogue, the team and one member', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { success: true, data: {} } } as never)

    await teamApi.getRoles()
    await teamApi.getPermissionCatalogue()
    await teamApi.getTeam()
    await teamApi.getTeam({ includeRevoked: true })
    await teamApi.getMember('asg-1')

    expect(get.mock.calls.map((c) => c[0])).toEqual([
      '/team/meta/roles',
      '/team/meta/permissions',
      '/team',
      '/team',
      '/team/asg-1',
    ])
    expect(get.mock.calls[3][1]).toEqual({ params: { includeRevoked: true } })
  })

  it('invites through POST /team/invites, leaving branchIds out for all branches', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true, data: {} } } as never)

    await teamApi.invite({ email: 'a@b.co', roleKey: 'ORG_ADMIN', assignToAllBranches: true, branchIds: ['x'] })
    expect(post).toHaveBeenLastCalledWith('/team/invites', {
      email: 'a@b.co',
      roleKey: 'ORG_ADMIN',
      assignToAllBranches: true,
    })

    await teamApi.invite({ email: 'a@b.co', roleKey: 'DESK', fullName: 'A B', assignToAllBranches: false, branchIds: ['x'] })
    expect(post).toHaveBeenLastCalledWith('/team/invites', {
      email: 'a@b.co',
      roleKey: 'DESK',
      fullName: 'A B',
      assignToAllBranches: false,
      branchIds: ['x'],
    })
  })

  it('sends expectedVersion on both edits (RBAC-08)', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: { success: true, data: {} } } as never)
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: { success: true, data: {} } } as never)

    await teamApi.updateMember('asg-1', { roleKey: 'TRAINER', expectedVersion: 7 })
    expect(patch).toHaveBeenCalledWith('/team/asg-1', { roleKey: 'TRAINER', expectedVersion: 7 })

    const overrides = [{ permissionKey: 'members.create', effect: 'ALLOW' as const }]
    await teamApi.setPermissions('asg-1', overrides, 7)
    expect(put).toHaveBeenCalledWith('/team/asg-1/permissions', { overrides, expectedVersion: 7 })
  })

  it('revokes with DELETE /team/:id', async () => {
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: { success: true, data: null } } as never)
    await teamApi.revokeMember('asg-1')
    expect(del).toHaveBeenCalledWith('/team/asg-1')
  })
})

describe('effective permissions read the same in the CMS as in the app (UX-12 acceptance)', () => {
  /**
   * The app's rule, restated from gyms_era team_models.dart `TeamMemberDetail.tierFor`:
   * '*' → direct; key absent → off; key + key.direct → direct; key alone → request.
   */
  const mobileTierFor = (effective: string[], key: string) => {
    if (effective.includes('*')) return 'DIRECT'
    if (!effective.includes(key)) return 'OFF'
    return effective.includes(`${key}.direct`) ? 'DIRECT' : 'REQUEST'
  }

  const people: Record<string, string[]> = {
    owner: ['*'],
    deskOnPreset: ['members.view', 'members.create', 'attendance.checkin'],
    deskPromoted: ['members.view', 'members.create', 'members.create.direct', 'members.delete'],
    nobody: [],
  }

  it.each(Object.entries(people))('%s: every permission resolves to the same tier', (_name, effective) => {
    for (const p of perms) {
      expect(savedTier({ effectivePermissions: effective }, p.key)).toBe(mobileTierFor(effective, p.key))
    }
  })

  it('an unedited row shows exactly what the server resolved, whatever overrides exist', () => {
    const detail = {
      effectivePermissions: ['members.view', 'attendance.checkin'],
      overrides: [{ permissionKey: 'members.create', effect: 'DENY' as const }],
    }
    const saved = toOverrideMap(detail.overrides)
    expect(displayTier(perm('members.create'), detail, saved, saved, 'REQUEST')).toBe('OFF')
    expect(displayTier(perm('members.view'), detail, saved, saved, 'REQUEST')).toBe('REQUEST')
  })
})

describe('staging — the same writes as the mobile editor', () => {
  it('Off denies the base key and drops the .direct twin', () => {
    const next = stageTier({}, perm('members.create'), 'OFF')
    expect(Object.values(next)).toEqual([{ permissionKey: 'members.create', effect: 'DENY' }])
  })

  it('Needs approval allows the base key and denies the twin; Direct allows both', () => {
    expect(Object.values(stageTier({}, perm('members.create'), 'REQUEST'))).toEqual([
      { permissionKey: 'members.create', effect: 'ALLOW' },
      { permissionKey: 'members.create.direct', effect: 'DENY' },
    ])
    expect(Object.values(stageTier({}, perm('members.create'), 'DIRECT'))).toEqual([
      { permissionKey: 'members.create', effect: 'ALLOW' },
      { permissionKey: 'members.create.direct', effect: 'ALLOW' },
    ])
  })

  it('a permission that is not approvable never gets a .direct twin', () => {
    expect(Object.values(stageTier({}, perm('attendance.checkin'), 'DIRECT'))).toEqual([
      { permissionKey: 'attendance.checkin', effect: 'ALLOW' },
    ])
  })

  it('keeps a saved override’s data scope when its tier changes', () => {
    const saved = toOverrideMap([{ permissionKey: 'members.create', effect: 'ALLOW', dataScope: 'OWN', branchId: null }])
    const next = stageTier(saved, perm('members.create'), 'OFF')
    expect(next['members.create@*']).toMatchObject({ effect: 'DENY', dataScope: 'OWN' })
  })

  it('diff lists only changed rows; changing a row back removes it from the diff', () => {
    const saved = toOverrideMap(deskDetail.overrides)
    let working = stageTier(saved, perm('members.create'), 'DIRECT')
    expect(diffChanges(perms, deskDetail, saved, working, desk)).toEqual([
      { permissionKey: 'members.create', label: 'Add a member', approvable: true, before: 'REQUEST', after: 'DIRECT' },
    ])
    working = {}
    expect(diffChanges(perms, deskDetail, saved, working, desk)).toEqual([])
  })
})

describe('role-preset tiers (RBAC-01)', () => {
  it('labels View / Approve / Full from the role and leaves the three choices editable', () => {
    expect(presetOnlyLabel(perm('members.view'), desk, {})).toBe('View only · from Front Desk role')
    // R and D are two of the three choices.
    expect(presetOnlyLabel(perm('members.create'), desk, {})).toBeNull()
    expect(presetOnlyLabel(perm('attendance.checkin'), desk, {})).toBeNull()
    // Not in the preset at all: editable (currently Off).
    expect(presetOnlyLabel(perm('members.delete'), desk, {})).toBeNull()
  })

  it('a row that already carries an override stays editable so it can be undone', () => {
    const working = toOverrideMap([{ permissionKey: 'members.view', effect: 'DENY' }])
    expect(presetOnlyLabel(perm('members.view'), desk, working)).toBeNull()
  })

  it('maps the preset to the three choices', () => {
    expect(presetTierFor(desk, 'members.create')).toBe('REQUEST')
    expect(presetTierFor(desk, 'members.delete')).toBe('OFF')
  })
})

describe('team errors', () => {
  it('recognises 409 grants_changed, and only that', () => {
    expect(isGrantsChanged(apiError(409, 'x', 'grants_changed'))).toBe(true)
    expect(isGrantsChanged(apiError(409, 'already on your team'))).toBe(false)
    expect(isGrantsChanged(apiError(403, 'x'))).toBe(false)
  })

  it('keeps the server’s specific sentence when only a generic code came with it', () => {
    const message = 'You cannot assign the Org Admin role — it is at or above your own level'
    expect(teamErrorMessage(apiError(403, message)).message).toBe(message)
  })

  it('uses the shared error-copy table for codes it knows', () => {
    expect(teamErrorMessage(apiError(403, 'raw', 'branch_billing_locked')).message).toMatch(/locked due to plan limits/i)
  })
})
