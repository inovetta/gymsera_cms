import type { MembershipPlan } from '@/types'

/**
 * Phase 7 P9b (R-80, the CMS half of P4): plan naming and the traveller-visibility rule, the same
 * as the mobile app (`membership_plans/domain/plan_display.dart`, `plan_visibility.dart`). The API
 * is the authority (`membership-plan.service.js#isTravellerVisible`, 422 `last_visible_plan`);
 * these only let the CMS refuse before sending, with the same copy.
 */

/** BUG-33: a plan is shown as the host typed it. Nothing is added. */
export const planDisplayName = (name: string | null | undefined): string => (name ?? '').trim()

/**
 * The plan's length the way the API counts it (`business-date.utils.js#addPlanDuration`):
 * a QUARTERLY plan of value n lasts 3 x n months.
 */
export function planDurationLabel(durationType: string, durationValue: number | string | null | undefined): string {
  const raw = Number(durationValue)
  const n = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
  const count = (k: number, unit: string) => (k === 1 ? `1 ${unit}` : `${k} ${unit}s`)
  switch ((durationType || '').toUpperCase()) {
    case 'DAILY': return count(n, 'Day')
    case 'WEEKLY': return count(n, 'Week')
    case 'QUARTERLY': return count(n * 3, 'Month')
    case 'YEARLY': return count(n, 'Year')
    case 'MONTHLY':
    default: return count(n, 'Month')
  }
}

type VisibilityFields = Pick<MembershipPlan, 'id' | 'status' | 'isPublic' | 'isDeactivated' | 'branchId'>

/** A plan travellers can see: active, not deactivated, shown to travellers. */
export const isTravellerVisible = (p: Pick<VisibilityFields, 'status' | 'isPublic' | 'isDeactivated'>): boolean =>
  (p.status || '').toUpperCase() === 'ACTIVE' && !p.isDeactivated && !!p.isPublic

/**
 * Whether `plan` is the last plan travellers can see at some branch, so it must stay visible.
 * A plan counts for a branch when it is for that branch or for every branch (`branchId` empty).
 * A branch plan is checked against its own branch; a gym-wide plan against every branch in
 * `branchIds`. With no branch ids, it is the last when no other plan is visible.
 */
export function isLastVisiblePlan(plan: VisibilityFields, plans: VisibilityFields[], branchIds: string[] = []): boolean {
  if (!isTravellerVisible(plan)) return false
  const others = plans.filter((p) => p.id !== plan.id && isTravellerVisible(p))
  const branches = plan.branchId ? [plan.branchId] : branchIds
  if (branches.length === 0) return others.length === 0
  return branches.some((b) => !others.some((p) => p.branchId === b || !p.branchId))
}

/** Branches (of `branches`) with no plan travellers can see: not live for travellers (R-77). */
export function branchesWithoutVisiblePlan<B extends { id: string }>(branches: B[], plans: VisibilityFields[]): B[] {
  const visible = plans.filter(isTravellerVisible)
  return branches.filter((b) => !visible.some((p) => p.branchId === b.id || !p.branchId))
}

/**
 * The first plan of a new branch or organization (POST /host/branches, POST /host/listings).
 * One period of the chosen type, as the app's plan dialog sends it: the API multiplies a
 * QUARTERLY value by 3 months and counts YEARLY in years, so 1 is one quarter / one year.
 */
export const firstPlanPackage = (name: string, price: number, durationType: string) => ({
  name,
  price,
  durationType,
  durationValue: 1,
})
