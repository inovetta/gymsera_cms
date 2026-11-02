/**
 * Phase 7 P9b item 4: what a branch's state means for the host, one rule for /gym/branches and the
 * admin tenant Branches tab (mobile host_gyms_overview_screen.dart labels: PAUSED / ACTIVE /
 * DEACTIVATED / IN REVIEW; the billing lock of R-82 / R-83).
 *
 * - Paused (P5b, R-81): the host hid it; members, plans and history stay.
 * - Locked (R-82): over the plan's branch limit, or the plan ended; no new members, sales or plans;
 *   members can check in for 7 days after the lock (CAP-01). The API's `billingLockReason` is a
 *   developer sentence (branch-billing-lock.service.js), so it is said here in plain words.
 * - Traveller review: `travelerVisibilityStatus` pending = in review, deactivated = hidden by GymsEra.
 */
export interface BranchStateInput {
  status?: string | null
  pausedAt?: string | null
  billingLockedAt?: string | null
  billingLockReason?: string | null
  travelerVisibilityStatus?: string | null
  deactivationReason?: string | null
}

export interface BranchState {
  key: 'paused' | 'locked' | 'in_review' | 'hidden_by_gymsera' | 'visible'
  label: string
  reason: string | null
  tone: 'ok' | 'warning' | 'danger' | 'info'
}

const LOCK_PLAN_ENDED =
  'Your plan has ended. No new members, sales or plans here until a plan is active again. Members can check in for 7 days after the lock.'
const LOCK_OVER_LIMIT =
  "This branch is over your plan's branch limit. No new members, sales or plans here until you upgrade or delete a branch. Members can check in for 7 days after the lock."

/** The plain reason for a billing lock: the plan ended, else over the limit (the only two the API writes). */
export const lockReasonText = (reason: string | null | undefined): string =>
  /plan has ended/i.test(reason ?? '') ? LOCK_PLAN_ENDED : LOCK_OVER_LIMIT

export function branchStates(b: BranchStateInput): BranchState[] {
  const states: BranchState[] = []
  if (b.billingLockedAt) {
    states.push({ key: 'locked', label: 'Locked', reason: lockReasonText(b.billingLockReason), tone: 'danger' })
  }
  if (b.pausedAt) {
    states.push({ key: 'paused', label: 'Paused', reason: 'Hidden from travellers. Members, plans and history stay.', tone: 'warning' })
  }
  const visibility = (b.travelerVisibilityStatus || 'pending').toLowerCase()
  if (visibility === 'deactivated') {
    states.push({
      key: 'hidden_by_gymsera',
      label: 'Hidden by GymsEra',
      reason: b.deactivationReason?.trim() || 'GymsEra has hidden this branch from travellers. Contact support to find out why.',
      tone: 'danger',
    })
  } else if (visibility === 'pending') {
    states.push({ key: 'in_review', label: 'In review', reason: 'GymsEra is reviewing this branch before travellers can see it.', tone: 'info' })
  } else if (!b.pausedAt && !b.billingLockedAt) {
    states.push({ key: 'visible', label: 'Visible to travellers', reason: null, tone: 'ok' })
  }
  return states
}
