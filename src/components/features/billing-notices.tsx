'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { hostBillingApi } from '@/lib/api/host-billing'
import { useBranchQuota } from '@/hooks/use-branch-quota'
import { billingNoticesFrom } from '@/lib/billing-notices'
import { cn } from '@/lib/utils'

/**
 * The plan's problems for the host (NEW-21, NEW-32), as on the mobile BillingNoticesSection: payment due or
 * failed renewal, branches over the plan with days left, a second subscription still billing.
 * Draws nothing when all is well or when the plan could not be read (no plan is a normal state;
 * the page it sits on shows its own error).
 */
export function BillingNotices() {
  const { data: subData } = useQuery({
    queryKey: ['host-subscription-current'],
    queryFn: () => hostBillingApi.getCurrentSubscription(),
    staleTime: 30_000,
    retry: false,
  })
  const { data: quotaData } = useBranchQuota()
  return (
    <BillingNoticeList
      subscription={subData?.data as Record<string, unknown> | undefined}
      activeBranches={quotaData?.data?.activeBranches}
    />
  )
}

/** The notices for a subscription a page has already loaded (no second request). */
export function BillingNoticeList({
  subscription,
  activeBranches,
}: {
  subscription: Record<string, unknown> | null | undefined
  activeBranches?: number
}) {
  if (!subscription) return null
  const notices = billingNoticesFrom(subscription, { activeBranches })
  if (notices.length === 0) return null

  return (
    <div className="space-y-3" data-testid="billing-notices">
      {notices.map((n) => {
        const critical = n.severity === 'critical'
        return (
          <div
            key={n.title}
            role="alert"
            className={cn(
              'flex gap-3 rounded-lg border p-3 text-sm',
              critical ? 'border-destructive/30 bg-red-50 dark:bg-red-950/30' : 'border-primary/30 bg-orange-50 dark:bg-orange-950/30'
            )}
          >
            <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', critical ? 'text-destructive' : 'text-primary')} />
            <div>
              <p className="font-bold">{n.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
              {n.actionUrl && n.actionLabel ? (
                <a
                  href={n.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn('mt-1.5 inline-block text-xs font-semibold underline', critical ? 'text-destructive' : 'text-primary')}
                >
                  {n.actionLabel}
                </a>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
