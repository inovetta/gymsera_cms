'use client'

import { AlertCircle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import type { SubscriptionLapse } from '@/lib/api/host-billing'

export const lapseTitle = (reason: string) =>
  ({ on_hold: 'On hold', refunded: 'Refunded', paused: 'Paused' } as Record<string, string>)[reason] ?? 'Plan ended'

const storeName = (provider: string) =>
  ({ IOS: 'the App Store', ANDROID: 'Google Play', STRIPE: 'your card provider' } as Record<string, string>)[provider] ?? 'the payment provider'

const date = (v?: string | null) => (v ? formatDate(v) : null)

/**
 * A plan that no longer covers the branches (Phase 7 P9, NEW-180; R-82), as the mobile My Subscription
 * (_LapsedPlanCard / _LapsedActions): what happened, when the branches lock, and the one action that fixes
 * it. Built only from the API's `lapse` block. Buying a plan happens in the GymsEra app (store-owned).
 */
export function LapsedPlanCard({ lapse, endDate, platform }: { lapse: SubscriptionLapse; endDate?: string | null; platform?: string | null }) {
  const reason = lapse.reason || 'expired'
  const provider = String(lapse.provider || platform || '').toUpperCase()
  const ended = date(endDate)
  const lockDate = date(lapse.branchesLockAt)
  const store = storeName(provider)

  const what =
    reason === 'on_hold'
      ? `${store[0].toUpperCase()}${store.slice(1)} couldn't take your renewal payment, so your plan is on hold.`
      : reason === 'refunded'
        ? 'This plan was refunded, so it no longer covers your branches.'
        : reason === 'paused'
          ? 'You paused this plan in Google Play.'
          : ended
            ? `Your plan ended on ${ended}.`
            : 'Your plan has ended.'
  const branches =
    lapse.inGrace && lockDate
      ? `Your branches stay open until ${lockDate}. After that they're locked: no new members, sales or plans, and members can still check in for 7 more days.`
      : 'Your branches are locked: no new members, sales or plans. Members can check in for 7 days after the lock.'

  const manageUrl = lapse.manageUrl && /^https:\/\//i.test(lapse.manageUrl) ? lapse.manageUrl : null
  const storeLabel = provider === 'IOS' ? 'App Store' : 'Google Play'
  const storeFix =
    manageUrl && (provider === 'IOS' || provider === 'ANDROID')
      ? reason === 'on_hold'
        ? `Fix payment in ${storeLabel}`
        : reason === 'paused'
          ? `Resume in ${storeLabel}`
          : null
      : null
  const next =
    provider === 'MANUAL'
      ? 'To start again, pay by bank transfer below; support activates the plan once the payment is confirmed.'
      : 'To start again, subscribe again from the GymsEra app.'

  return (
    <div data-testid="lapsed-plan" role="status" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-5 text-sm">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-warning" />
        <p className="text-lg font-semibold">{lapseTitle(reason)}</p>
      </div>
      <p>{what}</p>
      <p>{branches}</p>
      {storeFix ? (
        <a href={manageUrl as string} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: 'sm' })}>
          {storeFix}
        </a>
      ) : (
        <p className="text-muted-foreground">{next}</p>
      )}
    </div>
  )
}
