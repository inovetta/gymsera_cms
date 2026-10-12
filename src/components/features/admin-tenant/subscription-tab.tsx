'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Plus } from 'lucide-react'
import { ErrorState } from '@/components/features/error-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { adminApi, TenantSubscription, AssignSubscriptionPayload } from '@/lib/api/admin'
import { packagesApi } from '@/lib/api/packages'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const SUB_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
  // Transitional states from a cross-provider migration: see subscription-migration.service.js.
  PENDING_MIGRATION: 'bg-blue-100 text-blue-700',
  PENDING_CANCEL: 'bg-orange-100 text-orange-700',
  SCHEDULED: 'bg-orange-100 text-orange-700',
}

const PLATFORM_LABELS: Record<string, string> = {
  MANUAL: 'Bank Transfer / Manual',
  IOS: 'Apple App Store',
  ANDROID: 'Google Play',
  STRIPE: 'Stripe (Card)',
}

/** Subscription history and manual assignment. Mounted only while its tab is open (PERF-10). */
export function SubscriptionTab({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [assignSubDialog, setAssignSubDialog] = useState(false)
  const [subForm, setSubForm] = useState<AssignSubscriptionPayload>({ packageId: '', billingCycle: 'MONTHLY', createInvoice: true, autoRenew: true })

  // Same query key as the page header's "Subscribed until" badge, so the cache is shared; opening the
  // tab refreshes it once.
  const { data: subscriptionsData, isLoading: subsLoading, error: subsError, refetch } = useQuery({
    queryKey: ['admin-tenant-subscriptions', tenantId],
    queryFn: () => adminApi.getTenantSubscriptions(tenantId),
  })

  // Only the assign dialog needs the package list.
  const { data: packagesData } = useQuery({
    queryKey: ['packages'],
    queryFn: () => packagesApi.getPackages(),
    enabled: assignSubDialog,
  })
  const packages = Array.isArray(packagesData?.data) ? (packagesData.data as any[]) : []

  const assignSubMutation = useMutation({
    mutationFn: (payload: AssignSubscriptionPayload) => adminApi.assignTenantSubscription(tenantId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-subscriptions', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-invoices', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] })
      setAssignSubDialog(false)
      toast({ title: 'Subscription assigned successfully' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to assign subscription', variant: 'destructive' }),
  })

  const revokeSubMutation = useMutation({
    mutationFn: (subId: string) => adminApi.revokeTenantSubscription(tenantId, subId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-tenant-subscriptions', tenantId] }); toast({ title: 'Subscription revoked' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || err?.message || 'Failed to revoke subscription', variant: 'destructive' }),
  })

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Subscription History</h3>
        <Button onClick={() => setAssignSubDialog(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Assign Subscription
        </Button>
      </div>

      {subsLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : subsError ? (
        <ErrorState error={subsError} what="the subscription history" onRetry={() => refetch()} compact />
      ) : !subscriptionsData?.data?.subscriptions?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No subscriptions found. Assign a subscription to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {subscriptionsData.data.subscriptions.map((sub: TenantSubscription) => {
            const isActive = sub.status === 'ACTIVE'
            const daysLeft = isActive ? Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / 86400000) : null
            const isExpired = daysLeft !== null && daysLeft < 0
            const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7

            return (
              <Card key={sub.id} className={isActive ? 'border-green-200 bg-green-50/30' : ''}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-semibold">
                          {/* Store-verified (IOS/ANDROID/STRIPE) rows never have a `package` —
                              branchCount is the real entitlement instead (see
                              TenantSubscription.model.js on the backend). */}
                          {sub.package?.name ?? (sub.branchCount ? `${sub.branchCount} branch${sub.branchCount !== 1 ? 'es' : ''}` : 'Unknown Package')}
                        </span>
                        {sub.platform && sub.platform !== 'MANUAL' && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                            {PLATFORM_LABELS[sub.platform]}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SUB_STATUS_COLORS[sub.status] ?? ''}`}>{sub.status.replace('_', ' ')}</span>
                        {isExpired && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">Expired</span>}
                        {isExpiringSoon && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">Expiring soon!</span>}
                      </div>
                      <div className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-3">
                        <span>Billing: {sub.billingCycle}</span>
                        <span>Amount (locked-in): {formatCurrency(sub.amount)}</span>
                        <span>Auto-renew: {sub.autoRenew ? 'Yes' : 'No'}</span>
                        <span>Start: {formatDate(sub.startDate)}</span>
                        <span className={isExpiringSoon ? 'text-yellow-600 font-medium' : isExpired ? 'text-red-600 font-medium' : ''}>Expires: {formatDate(sub.endDate)}</span>
                        {daysLeft !== null && !isExpired && (
                          <span className={isExpiringSoon ? 'text-yellow-600 font-semibold' : 'text-green-600'}>
                            {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
                          </span>
                        )}
                        {isExpired && (
                          <span className="text-red-600 font-semibold">{Math.abs(daysLeft!)} day{Math.abs(daysLeft!) !== 1 ? 's' : ''} overdue</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium ${sub.paymentStatus === 'PAID' ? 'text-green-600' : sub.paymentStatus === 'FAILED' ? 'text-red-600' : 'text-yellow-600'}`}>
                          Payment: {sub.paymentStatus}
                        </span>
                        {!!sub.overQuotaCount && (
                          <span className="text-xs font-medium text-red-600">Over quota by {sub.overQuotaCount}</span>
                        )}
                      </div>
                      {/* Guidance for a transitional state the admin (or the host) needs to
                          act on — e.g. "cancel your Apple subscription yourself" after a
                          migration to a different provider. See
                          subscription-migration.service.js on the backend. */}
                      {sub.statusNote && (
                        <div className="mt-2 text-xs rounded-lg bg-orange-50 border border-orange-200 text-orange-700 px-3 py-2">
                          {sub.statusNote}
                        </div>
                      )}
                    </div>
                    {isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive hover:text-white shrink-0"
                        onClick={() => revokeSubMutation.mutate(sub.id)}
                        loading={revokeSubMutation.isPending}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>

  <Dialog open={assignSubDialog} onOpenChange={setAssignSubDialog}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Assign Subscription</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label className="mb-2 block">Package *</Label>
          <Select value={subForm.packageId} onValueChange={(v) => setSubForm((p) => ({ ...p, packageId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select a package" /></SelectTrigger>
            <SelectContent>
              {packages.map((pkg: any) => (
                <SelectItem key={pkg.id} value={pkg.id}>{pkg.name} — {formatCurrency(pkg.price)} / {pkg.billingCycle?.toLowerCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 block">Billing Cycle</Label>
          <Select value={subForm.billingCycle} onValueChange={(v: any) => setSubForm((p) => ({ ...p, billingCycle: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MONTHLY">Monthly</SelectItem>
              <SelectItem value="QUARTERLY">Quarterly</SelectItem>
              <SelectItem value="YEARLY">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 block">Start Date</Label>
          <Input type="date" value={subForm.startDate || ''} onChange={(e) => setSubForm((p) => ({ ...p, startDate: e.target.value }))} />
        </div>
        <div>
          <Label className="mb-2 block">Custom Amount (optional)</Label>
          <Input type="number" placeholder="Leave empty to use package price" value={subForm.amount ?? ''} onChange={(e) => setSubForm((p) => ({ ...p, amount: e.target.value ? Number(e.target.value) : undefined }))} />
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="createInvoice" checked={subForm.createInvoice ?? true} onChange={(e) => setSubForm((p) => ({ ...p, createInvoice: e.target.checked }))} className="h-4 w-4" />
          <Label htmlFor="createInvoice" className="cursor-pointer">Auto-create invoice</Label>
        </div>
        <div className="flex items-center gap-3">
          <input type="checkbox" id="autoRenew" checked={subForm.autoRenew ?? true} onChange={(e) => setSubForm((p) => ({ ...p, autoRenew: e.target.checked }))} className="h-4 w-4" />
          <Label htmlFor="autoRenew" className="cursor-pointer">Auto-renew</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setAssignSubDialog(false)}>Cancel</Button>
        <Button onClick={() => assignSubMutation.mutate(subForm)} loading={assignSubMutation.isPending} disabled={!subForm.packageId}>Assign</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

    </>
  )
}
