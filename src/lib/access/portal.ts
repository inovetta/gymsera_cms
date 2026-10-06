import type { MyContext } from '@/lib/api/me'
import type { UserRole } from '@/types'

export const PORTAL_REFUSAL = 'This account does not have management portal access.'

/**
 * Account roles that predate team access. They keep their way in unchanged: a
 * platform admin has no organization, and a host waiting for approval has none yet.
 */
const LEGACY_PORTAL_ROLES: UserRole[] = ['PLATFORM_ADMIN', 'GYM_HOST', 'BRANCH_MANAGER']

export const isLegacyPortalRole = (role: UserRole | undefined | null) =>
  !!role && LEGACY_PORTAL_ROLES.includes(role)

/**
 * NEW-43: may this person use the management portal? Yes when they own an
 * organization or hold any gym permission in at least one (GET /me/context, the
 * same source as the menu). The account role (`users.role`) stays MEMBER for a team
 * member, so it is only consulted for the legacy roles above.
 */
export const hasPortalAccess = (context: MyContext | undefined | null, role?: UserRole | null): boolean => {
  if (isLegacyPortalRole(role)) return true
  return (context?.organizations ?? []).some(
    (org) =>
      org.isOwner ||
      org.orgPermissions.length > 0 ||
      org.branches.some((branch) => branch.permissions.length > 0)
  )
}
