import type { PermissionModule, TeamMember, TeamMemberDetail, TeamRole } from '@/lib/api/team'

/** Shapes copied from GET /team/meta/*, GET /team and GET /team/:id (gymsera_be team.controller.js). */

const role = (
  key: string,
  level: number,
  name: string,
  assignableByMe: boolean,
  preset: Array<[string, string]> = []
): TeamRole => ({
  key,
  level,
  name,
  displayName: name,
  charter: `${name} charter`,
  assignable: key !== 'OWNER',
  assignableByMe,
  defaultScope: level >= 80 ? 'ORG' : 'BRANCH',
  permissionCount: preset.length,
  preset: preset.map(([permissionKey, tier]) => ({ permissionKey, scope: 'ALL', tier })),
})

/** Roles as a Branch Manager (level 60) sees them: nothing at or above 60 is assignable. */
export const rolesForManager: TeamRole[] = [
  role('OWNER', 100, 'Owner', false),
  role('ORG_ADMIN', 80, 'Org Admin', false),
  role('MANAGER', 60, 'Branch Manager', false),
  role('BR_ADMIN', 40, 'Branch Admin', true),
  role('DESK', 20, 'Front Desk', true, [
    ['members.view', 'V'],
    ['members.create', 'R'],
    ['attendance.checkin', 'D'],
  ]),
  role('TRAINER', 20, 'Trainer', true),
  role('SUPPORT', 5, 'Support', true),
]

export const rolesForOwner: TeamRole[] = rolesForManager.map((r) => ({ ...r, assignableByMe: r.assignable }))

export const catalogue: PermissionModule[] = [
  {
    module: 'members',
    label: 'Members',
    permissions: [
      { key: 'members.view', label: 'View members', approvable: false, dangerous: false, orgOnly: false, scopes: ['ALL'], note: null },
      { key: 'members.create', label: 'Add a member', approvable: true, dangerous: false, orgOnly: false, scopes: ['ALL'], note: null },
      { key: 'members.delete', label: 'Delete a member', approvable: true, dangerous: true, orgOnly: false, scopes: ['ALL'], note: null },
    ],
  },
  {
    module: 'attendance',
    label: 'Attendance',
    permissions: [
      { key: 'attendance.checkin', label: 'Check members in', approvable: false, dangerous: false, orgOnly: false, scopes: ['ALL'], note: null },
    ],
  },
]

export const deskMember: TeamMember = {
  id: 'asg-desk',
  userId: 'user-desk',
  email: 'sana@example.test',
  fullName: 'Sana Malik',
  profileImageUrl: null,
  role: { key: 'DESK', name: 'Front Desk', level: 20 },
  scopeType: 'BRANCH',
  status: 'ACTIVE',
  jobTitle: null,
  validUntil: null,
  branches: [{ id: 'branch-1', name: 'Uptown' }],
  hasCustomAccess: false,
  overrideCount: 0,
  version: 3,
}

/** A Front Desk clerk on the plain preset: view members, add members by request, check-ins on. */
export const deskDetail: TeamMemberDetail = {
  ...deskMember,
  overrides: [],
  effectivePermissions: ['members.view', 'members.create', 'attendance.checkin'],
  effectiveScopes: {},
}

export const managerMember: TeamMember = {
  ...deskMember,
  id: 'asg-manager',
  userId: 'user-manager',
  email: 'bilal@example.test',
  fullName: 'Bilal Ahmed',
  role: { key: 'MANAGER', name: 'Branch Manager', level: 60 },
  version: 1,
}

export const ownerMember: TeamMember = {
  ...deskMember,
  id: 'asg-owner',
  userId: 'user-owner',
  email: 'owner@example.test',
  fullName: 'Hira Khan',
  role: { key: 'OWNER', name: 'Owner', level: 100 },
  scopeType: 'ORG',
  branches: [],
  version: 1,
}

export const branches = [
  { id: 'branch-1', branchName: 'Uptown' },
  { id: 'branch-2', branchName: 'Downtown' },
]

export const apiError = (status: number, message: string, code?: string) => ({
  response: {
    status,
    data: {
      success: false,
      message,
      code: code ?? (status === 403 ? 'forbidden' : status === 409 ? 'conflict' : 'internal_error'),
    },
  },
})

export const ok = <T,>(data: T) => ({ success: true, message: 'ok', data })
