'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, Users } from 'lucide-react'
import { StatusBadge } from '@/components/features/status-badge'
import { ErrorState } from '@/components/features/error-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
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

  const { toast } = useToast()
  // SEC-17: contact details are masked by the server. A reveal is explicit, audited server-side, and kept
  // only in this component's state: leaving the tab, or Hide, drops the values again.
  const [revealed, setRevealed] = useState<Record<string, { email: string; phone: string | null }>>({})
  const [askingFor, setAskingFor] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const revealMutation = useMutation({
    mutationFn: (userId: string) => adminApi.revealTenantMemberContact(tenantId, userId, reason.trim() || undefined),
    onSuccess: (res, userId) => {
      setRevealed((prev) => ({ ...prev, [userId]: { email: res.data.email, phone: res.data.phone } }))
      setAskingFor(null)
      setReason('')
    },
    onError: () => toast({ title: 'Could not reveal contact details', description: 'Nothing was shown. Try again in a moment.', variant: 'destructive' }),
  })

  const hide = (userId: string) => setRevealed((prev) => {
    const next = { ...prev }
    delete next[userId]
    return next
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
                <p className="text-xs text-muted-foreground truncate">{revealed[member.userId]?.email ?? member.user?.email ?? member.userId}</p>
                {(revealed[member.userId]?.phone ?? member.user?.phone) && (
                  <p className="text-xs text-muted-foreground truncate">{revealed[member.userId]?.phone ?? member.user?.phone}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{member.plan?.name ?? '—'} · {member.branch?.branchName ?? '—'}</p>
                {member.user && (
                  revealed[member.userId] ? (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 mt-1 text-xs" onClick={() => hide(member.userId)}>
                      <EyeOff className="h-3.5 w-3.5 mr-1" /> Hide contact
                    </Button>
                  ) : askingFor === member.userId ? (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`reveal-reason-${member.userId}`} className="text-xs">Reason (optional)</Label>
                        <Input
                          id={`reveal-reason-${member.userId}`}
                          value={reason}
                          maxLength={200}
                          onChange={(e) => setReason(e.target.value)}
                          className="h-8 text-xs w-64"
                          placeholder="Why do you need it?"
                        />
                      </div>
                      <Button type="button" size="sm" className="h-8" disabled={revealMutation.isPending} onClick={() => revealMutation.mutate(member.userId)}>Reveal</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => { setAskingFor(null); setReason('') }}>Cancel</Button>
                      <p className="basis-full text-[11px] text-muted-foreground">Each reveal is recorded in the audit log with your name.</p>
                    </div>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 mt-1 text-xs" onClick={() => setAskingFor(member.userId)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Show contact
                    </Button>
                  )
                )}
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
