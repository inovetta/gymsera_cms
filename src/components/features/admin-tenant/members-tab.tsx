'use client'

import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { StatusBadge } from '@/components/features/status-badge'
import { ErrorState } from '@/components/features/error-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { adminApi } from '@/lib/api/admin'
import { formatDate, getInitials } from '@/lib/utils'
import type { Tenant } from '@/types'

/** Member subscriptions of one tenant. Mounted only while its tab is open, so it only fetches then (PERF-10). */
export function MembersTab({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const { data: membersData, isLoading: membersLoading, error: membersError, refetch } = useQuery({
    queryKey: ['admin-tenant-members', tenantId],
    queryFn: () => adminApi.getTenantMembers(tenantId),
    enabled: tenant.status === 'ACTIVE',
  })

  return (
  <Card>
    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Member Subscriptions</CardTitle></CardHeader>
    <CardContent>
      {tenant.status !== 'ACTIVE' ? (
        <p className="text-sm text-muted-foreground text-center py-8">Member data is only available for active tenants.</p>
      ) : membersLoading ? (
        <div className="space-y-4">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-1.5 flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div><Skeleton className="h-6 w-16 rounded-full" /><Skeleton className="h-4 w-24" /></div>)}</div>
      ) : membersError ? (
        <ErrorState error={membersError} what="the member list" onRetry={() => refetch()} compact />
      ) : !membersData?.data?.members?.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">No members found.</p>
      ) : (
        <div className="space-y-4">
          {membersData.data.members.map((member) => (
            <div key={member.id} className="flex items-center gap-4 p-3 rounded-lg border">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">{getInitials(member.user?.fullName ?? '?')}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{member.user?.fullName ?? 'Unknown'}</p>
                <p className="text-xs text-muted-foreground truncate">{member.user?.email ?? member.userId}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{member.plan?.name ?? '—'} · {member.branch?.branchName ?? '—'}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge status={member.status} />
                <span className="text-xs text-muted-foreground">{formatDate(member.startDate)} – {formatDate(member.endDate)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
  )
}
