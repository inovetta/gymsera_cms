import type { MyContext, OrgMembership } from '@/lib/api/me'

/**
 * GET /me/context shapes (gymsera_be context.controller.js). Permission lists are
 * the role presets from constants/permissions.js, trimmed to the keys the menu reads.
 */

const user = { id: 'user-1', fullName: 'Test Person', platformRole: 'MEMBER', isHost: false }

const context = (organizations: OrgMembership[]): MyContext => ({
  user,
  organizations,
  pendingApprovals: 0,
  needsContextSwitcher: organizations.length > 1,
})

const ORG_ADMIN_KEYS = [
  'dashboard.view', 'dashboard.revenue.view', 'members.view', 'checkins.view', 'schedule.view',
  'schedule.trainer.assign', 'subscriptions.view', 'payments.view', 'invoices.view', 'plans.view',
  'team.view', 'team.invite', 'approvals.view', 'approvals.decide', 'branch.settings', 'listing.manage',
]

const MANAGER_KEYS = [
  'dashboard.view', 'dashboard.revenue.view', 'members.view', 'checkins.view', 'schedule.view',
  'schedule.trainer.assign', 'subscriptions.view', 'payments.view', 'invoices.view', 'plans.view',
  'team.view', 'team.invite', 'approvals.view', 'approvals.decide', 'branch.settings',
]

/** An Org Admin: assigned to the whole organization. Account role MEMBER. */
export const orgAdminContext = context([
  {
    tenantId: 'tenant-1',
    name: 'Iron Gym',
    isOwner: false,
    role: { key: 'ORG_ADMIN', name: 'Org Admin', level: 80 },
    scopeType: 'ORG',
    orgPermissions: ORG_ADMIN_KEYS,
    branches: [
      { id: 'branch-1', name: 'Uptown', permissions: ORG_ADMIN_KEYS },
      { id: 'branch-2', name: 'Downtown', permissions: ORG_ADMIN_KEYS },
    ],
    pendingApprovals: 0,
  },
])

/**
 * A Branch Manager: assigned to one branch. The server resolves no org-wide
 * grants for a branch-scoped assignment, so `orgPermissions` is empty.
 */
export const branchManagerContext = context([
  {
    tenantId: 'tenant-1',
    name: 'Iron Gym',
    isOwner: false,
    role: { key: 'MANAGER', name: 'Branch Manager', level: 60 },
    scopeType: 'BRANCH',
    orgPermissions: [],
    branches: [{ id: 'branch-1', name: 'Uptown', permissions: MANAGER_KEYS }],
    pendingApprovals: 0,
  },
])

/** The owner: the server sends the `*` shorthand. */
export const ownerContext = context([
  {
    tenantId: 'tenant-1',
    name: 'Iron Gym',
    isOwner: true,
    role: { key: 'OWNER', name: 'Owner', level: 100 },
    scopeType: 'ORG',
    orgPermissions: ['*'],
    branches: [{ id: 'branch-1', name: 'Uptown', permissions: ['*'] }],
    pendingApprovals: 0,
  },
])

/** A gym member with no team role anywhere. */
export const plainMemberContext = context([])

const DESK_KEYS = [
  'dashboard.view', 'members.view', 'members.create', 'checkins.view', 'schedule.view',
  'subscriptions.view', 'subscriptions.create', 'payments.view', 'payments.record', 'invoices.view', 'plans.view',
]

/**
 * A Front Desk clerk: assigned to one branch, account role MEMBER. No org-wide
 * grants (a branch-scoped assignment resolves none); view-level keys at the branch.
 */
export const frontDeskContext = context([
  {
    tenantId: 'tenant-1',
    name: 'Iron Gym',
    isOwner: false,
    role: { key: 'DESK', name: 'Front Desk', level: 20 },
    scopeType: 'BRANCH',
    orgPermissions: [],
    branches: [{ id: 'branch-1', name: 'Uptown', permissions: DESK_KEYS }],
    pendingApprovals: 0,
  },
])

/** The same context with extra permission keys added at every branch. */
export const withPermissions = (source: MyContext, extra: string[]): MyContext => ({
  ...source,
  organizations: source.organizations.map((o) => ({
    ...o,
    branches: o.branches.map((b) => ({ ...b, permissions: [...b.permissions, ...extra] })),
  })),
})
