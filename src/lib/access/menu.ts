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

/**
 * The organization the CMS is acting in. The CMS sends no organization selector
 * yet, so the server uses the user's most senior membership; pick the same one.
 */
export const activeOrganization = (context: MyContext | undefined | null): OrgMembership | null => {
  const organizations = context?.organizations ?? []
  if (organizations.length === 0) return null
  return organizations.reduce((best, org) => (org.role.level > best.role.level ? org : best))
}
