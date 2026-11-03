/**
 * BUG-31 (Phase 7 P7a backend, P9b CMS): which dates of a membership are real.
 *
 * A request a member sent (status PENDING, `createdByRole` MEMBER) starts on the day the host
 * approves it (subscription.service.js#datesOnApproval); the dates on the pending row are only an
 * estimate from the day it was sent, so they are not shown. A membership staff entered keeps the
 * start date they chose, so its dates are real. A scheduled plan change (`pendingPlan`,
 * `pendingChangeEffectiveDate`) is shown with the date the API stores.
 */
export interface SubscriptionDatesInput {
  status?: string | null
  createdByRole?: string | null
  pendingPlan?: { name?: string | null } | null
  pendingPlanId?: string | null
  pendingChangeEffectiveDate?: string | null
}

export const startsOnApproval = (s: SubscriptionDatesInput): boolean =>
  (s.status || '').toUpperCase() === 'PENDING' && (s.createdByRole || '').toUpperCase() === 'MEMBER'

/** The scheduled plan change, or null when there is none. */
export function pendingPlanChange(s: SubscriptionDatesInput): { planName: string | null; date: string } | null {
  if (!s.pendingChangeEffectiveDate || !(s.pendingPlanId || s.pendingPlan)) return null
  return { planName: s.pendingPlan?.name?.trim() || null, date: s.pendingChangeEffectiveDate }
}
