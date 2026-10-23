'use client'

import Link from 'next/link'
import { AlertTriangle, Ticket } from 'lucide-react'
import { useBranchQuota } from '@/hooks/use-branch-quota'
import { cn } from '@/lib/utils'

/**
 * Tenant-wide branch capacity, as on the mobile Gyms tab (`_TenantCapacityBanner` and the
 * over-quota banner in host_gyms_overview_screen.dart). Read from useBranchQuota, the single
 * source; the numbers describe the whole subscription, never one organization.
 * The over-capacity warning, with its days-left countdown, is a BillingNotices notice (NEW-32).
 */
export function CapacityBanner() {
  const { data } = useBranchQuota()
  const quota = data?.data
  if (!quota) return null

  if (quota.maxBranches <= 0) {
    return (
      <div className="space-y-3" data-testid="capacity-banner">
        <Link
          href="/settings/billing"
          className="flex items-center gap-3 rounded-lg px-4 py-3 bg-primary/10 transition-colors hover:opacity-90"
        >
          <Ticket className="h-5 w-5 text-primary shrink-0" />
          <span className="text-sm font-medium text-primary">
            No active subscription (0 branch capacity). Subscribe in the GymsEra app to add and manage branches.
          </span>
        </Link>
      </div>
    )
  }

  const { maxBranches, activeBranches, buildableBranches } = quota
  const atLimit = buildableBranches <= 0

  return (
    <div className="space-y-3" data-testid="capacity-banner">
      {/* The plan is managed on the plan page; the web sells no store plans. */}
      <Link
        href="/settings/billing"
        className={cn(
          'flex items-center gap-3 rounded-lg px-4 py-3 transition-colors hover:opacity-90',
          atLimit ? 'bg-primary/10' : 'bg-primary/5'
        )}
      >
        <Ticket className="h-5 w-5 text-primary" />
        <span>
          <span className="block text-sm font-bold text-primary">
            {activeBranches} of {maxBranches} branches used
          </span>
          <span className="block text-xs text-muted-foreground">
            {atLimit
              ? 'All branches in use — add more in the GymsEra app'
              : `${buildableBranches} more ${buildableBranches === 1 ? 'branch' : 'branches'} available to build`}
          </span>
        </span>
      </Link>
    </div>
  )
}
