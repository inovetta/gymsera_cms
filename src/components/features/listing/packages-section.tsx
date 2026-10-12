'use client'

import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDuration } from '@/lib/utils'
import { describeRequestError } from '@/lib/api/request-errors'
import type { MembershipPlan } from '@/types'

interface PackagesSectionProps {
  plans: MembershipPlan[] | undefined
  loading: boolean
  error: unknown
  /** The person may create or edit plans (plans.create / plans.update). */
  canManage: boolean
}

/**
 * Packages & pricing of this branch, read from GET /membership-plans/host?branchId=. Plans are
 * created and edited on the Plans page, the one place that owns plan rules (price changes can go
 * through approval there); this section never writes a price.
 */
export function PackagesSection({ plans, loading, error, canManage }: PackagesSectionProps) {
  if (loading) return <Skeleton className="h-16" />
  if (error) {
    return (
      <Alert variant="destructive" data-testid="packages-error">
        <AlertDescription>{describeRequestError(error, 'The packages could not be loaded. Try again.')}</AlertDescription>
      </Alert>
    )
  }
  const list = plans ?? []
  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="packages-empty">
          No packages yet. Travelers cannot book until you add one.
        </p>
      ) : (
        <ul className="divide-y rounded-md border" data-testid="package-list">
          {list.map((plan) => (
            <li key={plan.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{plan.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(plan.durationType, plan.durationValue)}
                  {plan.branchId ? '' : ' · all branches'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-semibold">{formatCurrency(Number(plan.price))}</span>
                <Badge variant={plan.status === 'ACTIVE' ? 'success' : 'secondary'}>{plan.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <Link href="/gym/plans" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Manage packages and prices
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground">Changing packages needs the plan permissions. Ask the owner.</p>
      )}
    </div>
  )
}
