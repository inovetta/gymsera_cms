'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { ErrorState } from '@/components/features/error-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi } from '@/lib/api/admin'
import type { Tenant } from '@/types'

/**
 * The one place that answers "how many branches does this host actually have, across every
 * organization, against their real plan, and does the record agree with the ledger".
 * See subscription-quota.service.js#auditCapacity. Always resolves to the real tenant even from a
 * compound tenantId:listingId id: capacity belongs to the tenant-wide subscription.
 */
export function CapacityTab({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const { data: capacityAuditData, isLoading: capacityAuditLoading, error: capacityError, refetch } = useQuery({
    queryKey: ['admin-tenant-capacity-audit', tenantId],
    queryFn: () => adminApi.getTenantCapacityAudit(tenantId),
    enabled: tenant.status === 'ACTIVE',
  })

  return (
  <div className="space-y-4">
    {tenant.status !== 'ACTIVE' ? (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Capacity data is only available for active tenants.</CardContent></Card>
    ) : capacityAuditLoading ? (
      <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
    ) : capacityError ? (
      <ErrorState error={capacityError} what="the capacity report" onRetry={() => refetch()} compact />
    ) : !capacityAuditData?.data?.audit ? (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No capacity data available.</CardContent></Card>
    ) : (() => {
      const audit = capacityAuditData.data.audit
      return (
        <>
          <Card className={audit.ok ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Plan capacity</p>
                  <p className="text-2xl font-bold">
                    {audit.activeBranches ?? '—'} <span className="text-base font-normal text-muted-foreground">of {audit.maxBranches} branches active</span>
                  </p>
                  {audit.usedCapacity != null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {audit.usedCapacity} committed (active + unbuilt reserved) against a {audit.maxBranches}-branch plan
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {audit.ok ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700"><CheckCircle className="h-4 w-4" /> Integrity check passed</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700"><AlertCircle className="h-4 w-4" /> Needs a human look</span>
                  )}
                </div>
              </div>

              {audit.invariantHolds === false && (
                <div className="mt-3 text-sm rounded-lg bg-red-100 border border-red-200 text-red-800 px-3 py-2">
                  Committed capacity ({audit.usedCapacity}) exceeds the plan ({audit.maxBranches}). Real branches are never touched automatically — the host needs to upgrade or close a branch themselves.
                </div>
              )}
              {audit.overQuotaMismatch && (
                <div className="mt-3 text-sm rounded-lg bg-orange-100 border border-orange-200 text-orange-800 px-3 py-2">
                  Recorded over-quota is {audit.recordedOverQuota}, but should be {audit.expectedOverQuota} given the real branch count. This resolves itself the next time this tenant&apos;s capacity is reconciled (any branch delete/restore, or the daily job).
                </div>
              )}
              {audit.totalDrift !== 0 && (
                <div className="mt-3 text-sm rounded-lg bg-red-100 border border-red-200 text-red-800 px-3 py-2">
                  Ledger drift of {audit.totalDrift > 0 ? '+' : ''}{audit.totalDrift}: the audit trail (capacity_events) and the actual reserved-slot counts below disagree. This is reported, not auto-repaired — see the per-organization breakdown for where.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Per-organization breakdown</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!audit.listings.length ? (
                <p className="text-sm text-muted-foreground px-6 py-6">No organizations yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="font-medium px-6 py-2.5">Organization</th>
                      <th className="font-medium px-4 py-2.5">Reserved slots</th>
                      <th className="font-medium px-4 py-2.5">Ledger says</th>
                      <th className="font-medium px-4 py-2.5">Drift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.listings.map((l) => (
                      <tr key={l.listingId} className={`border-b last:border-0 ${l.drift !== 0 ? 'bg-red-50' : ''}`}>
                        <td className="px-6 py-2.5 font-medium">{l.title}</td>
                        <td className="px-4 py-2.5">{l.actualReservedSlots}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{l.ledgerReservedSlots}</td>
                        <td className="px-4 py-2.5">
                          {l.drift === 0 ? (
                            <span className="text-green-600">none</span>
                          ) : (
                            <span className="font-semibold text-red-600">{l.drift > 0 ? '+' : ''}{l.drift}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )
    })()}
  </div>
  )
}
