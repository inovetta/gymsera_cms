import type { OrgMembership } from '@/lib/api/me'
import { holdsAtBranch } from '@/lib/access/menu'

/**
 * What the signed-in person may do in one branch's listing editor, read from their effective
 * permissions (GET /me/context). Only labels and visibility: the server answers every save.
 *
 * - `manage` (listing.manage): see and edit the storefront sections.
 * - `settings` (branch.settings): upload photos, resubmit a deactivated listing.
 * - `plans` (plans.view): see the packages of this branch.
 *
 * `listing.manage` is not an approvable key (gymsera_be constants/permissions.js has no
 * `.direct` twin for it), so there is no "Needs approval" label to derive here: a save that the
 * server sends for approval answers 202 and the editor shows that, whatever the grant looked like.
 */
export interface ListingAccess {
  manage: boolean
  settings: boolean
  plans: boolean
  plansWrite: boolean
}

export function listingAccess(org: OrgMembership | null, branchId: string): ListingAccess {
  return {
    manage: holdsAtBranch(org, branchId, 'listing.manage'),
    settings: holdsAtBranch(org, branchId, 'branch.settings'),
    plans: holdsAtBranch(org, branchId, 'plans.view'),
    plansWrite: holdsAtBranch(org, branchId, 'plans.create') || holdsAtBranch(org, branchId, 'plans.update'),
  }
}
