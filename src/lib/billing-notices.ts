/**
 * What `GET /host/subscription/current` says is wrong with the plan, as plain notices (NEW-21, NEW-32).
 * The server decides every fact here (`paymentIssue`, `overQuotaCount`, the grace days, `duplicateBilling`);
 * this only words them. Same facts and wording as the mobile app's billing_notice.dart.
 */
export type NoticeSeverity = 'warning' | 'critical'

export interface BillingNotice {
  title: string
  message: string
  severity: NoticeSeverity
  actionLabel?: string
  actionUrl?: string
}

type Sub = Record<string, any>

const int = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : 0
}
const days = (n: number) => (n === 1 ? '1 day' : `${n} days`)
const branches = (n: number) => (n === 1 ? '1 branch' : `${n} branches`)

const storeName = (platform?: string | null) =>
  ({ IOS: 'App Store', ANDROID: 'Google Play', STRIPE: 'card billing' } as Record<string, string>)[platform ?? ''] ?? 'another provider'

/** Only a real https link is ever offered as an action. */
const safeUrl = (u: unknown): string | undefined => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : undefined)

export function billingNoticesFrom(sub: Sub, opts: { activeBranches?: number } = {}): BillingNotice[] {
  // NEW-180: a plan that does not entitle (P7c lapse) has no notices here until P9 builds its view.
  if (sub.entitled === false) return []
  const notices: BillingNotice[] = []

  // NEW-19: a smaller plan is scheduled and covers fewer branches than are active, and no choice was saved.
  // The choice is made in the mobile app (there is no such screen on the web).
  const change = sub.pendingChange
  if (change && typeof change === 'object' && opts.activeBranches != null) {
    const newCount = int(change.branchCount)
    const chosen = change.keepBranchIds
    if (!change.appliedAt && newCount > 0 && opts.activeBranches > newCount && !(Array.isArray(chosen) && chosen.length > 0)) {
      const when = change.effectiveAt ?? sub.endDate
      notices.push({
        title: 'Choose which branches to keep',
        message:
          `Your plan drops to ${branches(newCount)}${when ? ` on ${when}` : ''}, but you have ${opts.activeBranches} active. ` +
          `Open the GymsEra app and choose which ${newCount} stay open, or the others are locked.`,
        severity: 'critical',
      })
    }
  }

  const issue = sub.paymentIssue
  if (issue && typeof issue === 'object') {
    if (issue.provider === 'MANUAL') {
      const daysLeft = int(issue.daysLeft)
      notices.push({
        title: 'Payment due',
        message:
          daysLeft === 0
            ? 'Your plan ends today unless the payment is confirmed. Pay by bank transfer and contact support.'
            : `You have ${days(daysLeft)} left to pay (by ${issue.payBy ?? ''}). Your plan ends after that. Pay by bank transfer and contact support.`,
        severity: daysLeft <= 2 ? 'critical' : 'warning',
      })
    } else {
      const url = safeUrl(issue.manageUrl)
      notices.push({
        title: 'Payment problem',
        message:
          `Your last renewal payment did not go through. You keep your plan while ${storeName(issue.provider)} retries; ` +
          'update your payment method to avoid losing it.',
        severity: 'warning',
        ...(url ? { actionLabel: 'Fix payment', actionUrl: url } : {}),
      })
    }
  }

  const over = int(sub.overQuotaCount)
  if (over > 0) {
    const remaining = int(sub.overQuotaGraceRemainingDays)
    if (sub.isOverQuotaGraceExpired === true) {
      notices.push({
        title: 'Branches over your plan are locked',
        message: `Your plan covers ${branches(over)} fewer than you have active, and the grace period is over. Upgrade your plan or close a branch yourself to unlock them.`,
        severity: 'critical',
      })
    } else {
      notices.push({
        title: "Over your plan's branch capacity",
        message:
          `Your plan covers ${branches(over)} fewer than you have active. Nothing is closed yet: ` +
          `${days(remaining)} left before the extra branches are locked. Upgrade your plan or close a branch yourself.`,
        severity: remaining <= 2 ? 'critical' : 'warning',
      })
    }
  }

  if (sub.duplicateBilling === true) {
    const url = safeUrl(sub.duplicateBillingManageUrl)
    notices.push({
      title: 'You may be billed twice',
      message: `An older subscription through ${storeName(sub.duplicateBillingPlatform)} is still billing. Cancel it there so you are not charged twice.`,
      severity: 'warning',
      ...(url ? { actionLabel: 'Open subscriptions', actionUrl: url } : {}),
    })
  }

  return notices
}
