import type { MyContext, OrgMembership } from '@/lib/api/me'

/**
 * What the signed-in user may see in the menu, read from GET /me/context (NEW-42).
 * Mirrors the mobile `OrgMembership` / `BranchAccess.has` checks: a permission key
 * is held or it is not; the account role (`users.role`) is never consulted.
 */

/** Where a page's permission must be held. */
export type PermissionScope =
  /** Across the organization. The page's endpoints resolve org-wide grants. */
  | 'org'
  /** At one branch at least (or across the organization). */
  | 'branch'

const holds = (permissions: string[], key: string) => permissions.includes('*') || permissions.includes(key)

export const holdsPermission = (org: OrgMembership | null, key: string, scope: PermissionScope): boolean => {
  if (!org) return false
  if (org.isOwner || holds(org.orgPermissions, key)) return true
  return scope === 'branch' && org.branches.some((b) => holds(b.permissions, key))
}

/** Held at this one branch (or organization-wide)? For pages that act on a single branch. */
export const holdsAtBranch = (org: OrgMembership | null, branchId: string, key: string): boolean => {
  if (!org) return false
  if (org.isOwner || holds(org.orgPermissions, key)) return true
  return org.branches.some((b) => b.id === branchId && holds(b.permissions, key))
}

/**
 * What to call the signed-in user: their team role in the organization, not the
 * account role (`users.role`), which is MEMBER for every team member (NEW-45).
 */
export const roleLabel = (org: OrgMembership | null, accountRole?: string | null): string => {
  if (org) return org.isOwner ? 'Owner' : org.role.name
  return (accountRole ?? '').replace('_', ' ')
}

/**
 * The organization the CMS is acting in: the one chosen in the switcher, else the user's most
 * senior membership, which is what the server uses when no X-Tenant-Id is sent.
 */
export const activeOrganization = (
  context: MyContext | undefined | null,
  selectedTenantId?: string | null
): OrgMembership | null => {
  const organizations = context?.organizations ?? []
  if (organizations.length === 0) return null
  // The organization the person chose (Prompt 3B); otherwise the most senior, as the server does.
  const chosen = selectedTenantId ? organizations.find((o) => o.tenantId === selectedTenantId) : undefined
  if (chosen) return chosen
  return organizations.reduce((best, org) => (org.role.level > best.role.level ? org : best))
}
