'use client'

import { useQuery } from '@tanstack/react-query'
import { Dumbbell } from 'lucide-react'
import { StatusBadge } from '@/components/features/status-badge'
import { ErrorState } from '@/components/features/error-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi } from '@/lib/api/admin'
import { formatCurrency } from '@/lib/utils'
import type { Tenant } from '@/types'

/** Membership plans of one tenant. Mounted only while its tab is open, so it only fetches then (PERF-10). */
export function PlansTab({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const { data: plansData, isLoading: plansLoading, error: plansError, refetch } = useQuery({
    queryKey: ['admin-tenant-plans', tenantId],
    queryFn: () => adminApi.getTenantMembershipPlans(tenantId),
    enabled: tenant.status === 'ACTIVE',
  })

  return (
  <Card>
    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Dumbbell className="h-4 w-4" /> Membership Plans</CardTitle></CardHeader>
    <CardContent>
      {tenant.status !== 'ACTIVE' ? (
        <p className="text-sm text-muted-foreground text-center py-8">Plan data is only available for active tenants.</p>
      ) : plansLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="flex items-center gap-4"><div className="space-y-1.5 flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div><Skeleton className="h-6 w-16 rounded-full" /></div>)}</div>
      ) : plansError ? (
        <ErrorState error={plansError} what="the membership plans" onRetry={() => refetch()} compact />
      ) : !plansData?.data?.plans?.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">No membership plans found.</p>
      ) : (
        <div className="space-y-3">
          {plansData.data.plans.map((plan) => (
            <div key={plan.id} className="flex items-center gap-4 p-3 rounded-lg border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{plan.name}</p>
                  <StatusBadge status={plan.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {plan.branch?.branchName ?? 'Gym-wide'} · {plan.durationValue} {plan.durationType.toLowerCase()}
                  {plan.isTrial ? ' · Trial' : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{formatCurrency(plan.price)}</p>
                {plan.freezeLimitDays > 0 && <p className="text-xs text-muted-foreground">Freeze: {plan.freezeLimitDays}d</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
  )
}
