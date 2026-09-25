'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, Layers, Clock, CreditCard, Copy, Check, AlertCircle,
  Store, Smartphone, Building2, Info,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { tenantsApi } from '@/lib/api/tenants'
import { hostBillingApi } from '@/lib/api/host-billing'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { PlatformPackage, TenantSubscription } from '@/types'

const BANK_DETAILS = {
  'Bank Name': 'Meezan Bank',
  'Account Title': 'GymsEra Technologies Pvt Ltd',
  'Account Number': '0247-0105817703',
  'IBAN': 'PK61MEZN0002470105817703',
}

const PLATFORM_LABEL: Record<TenantSubscription['platform'], string> = {
  IOS: 'Apple App Store',
  ANDROID: 'Google Play',
  STRIPE: 'Card payment',
  MANUAL: 'Invoiced by GymsEra',
}

const STATUS_LABEL: Record<TenantSubscription['status'], string> = {
  ACTIVE: 'Active',
  PENDING_CANCEL: 'Action needed',
  PENDING_MIGRATION: 'Switching',
  SCHEDULED: 'Ending soon',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
}

export default function BillingPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedPkg, setSelectedPkg] = useState<PlatformPackage | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const { data: tenantData, isLoading: tenantLoading } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: () => tenantsApi.getMyTenant(),
  })

  // The SAME endpoint the mobile app's MySubscriptionScreen reads — one
  // real entitlement, not a CMS-specific view of it. 404s (via isError)
  // when the tenant has no active subscription at all, which is a normal
  // state here, not a failure to show.
  const { data: subData, isLoading: subLoading, isError: noActiveSub } = useQuery({
    queryKey: ['host-subscription-current'],
    queryFn: () => hostBillingApi.getCurrentSubscription(),
    retry: false,
  })

  const { data: quotaData } = useQuery({
    queryKey: ['host-branch-quota'],
    queryFn: () => hostBillingApi.getBranchQuota(),
  })

  const { data: catalogData, isLoading: catalogLoading } = useQuery({
    queryKey: ['billing-catalog'],
    queryFn: () => hostBillingApi.getCatalog(),
  })

  // Only relevant for the manual/invoice path below — never shown once a
  // real (store-verified) subscription exists.
  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ['platform-packages'],
    queryFn: () => tenantsApi.getPackages(),
  })

  const tenant = tenantData?.data?.tenant
  const sub = subData?.data
  const quota = quotaData?.data
  const catalog = catalogData?.data?.plans ?? []
  const packages = Array.isArray(packagesData?.data) ? packagesData.data : []

  // host.controller.js#upgradeSubscription's own guard, mirrored here: the
  // manual/invoice path only ever applies while there's no real,
  // store-verified subscription in the way. A manual-plan tenant (or one
  // with no plan at all) can still use it; an IAP tenant can't — the
  // backend refuses that request with 409 iap_subscription_active anyway,
  // this just avoids showing an option that would fail.
  const hasRealSubscription = !!sub && sub.branchCount != null

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const mutation = useMutation({
    mutationFn: (pkg: PlatformPackage) => hostBillingApi.requestManualPlan(pkg.id),
    onSuccess: (_, pkg) => {
      queryClient.invalidateQueries({ queryKey: ['host-subscription-current'] })
      queryClient.invalidateQueries({ queryKey: ['host-branch-quota'] })
      queryClient.invalidateQueries({ queryKey: ['my-tenant'] })
      setConfirmOpen(false)
      setSelectedPkg(null)
      toast({ title: `Switched to ${pkg.name} plan` })
    },
    onError: (err: unknown) => {
      const axiosError = err as { response?: { data?: { message?: string } } }
      toast({
        title: 'Error',
        description: axiosError.response?.data?.message || 'Failed to update package',
        variant: 'destructive',
      })
    },
  })

  const handleSelect = (pkg: PlatformPackage) => {
    setSelectedPkg(pkg)
    setConfirmOpen(true)
  }

  const isLoading = tenantLoading || subLoading || packagesLoading

  if (isLoading) {
    return (
      <>
        <Header title="Subscription & Billing" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Subscription & Billing" description="Manage your platform subscription plan" />
      <div className="p-6 animate-fade-in space-y-6">

        {/* Current plan — the real entitlement, whichever provider it's on */}
        {sub && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Layers className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Current Plan</p>
                    <p className="font-semibold text-lg">
                      {sub.branchCount != null
                        ? `${sub.branchCount} ${sub.branchCount === 1 ? 'Branch' : 'Branches'}`
                        : sub.package?.name || 'Subscription'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-bold text-xl text-primary">{formatCurrency(sub.amount)}</p>
                    <p className="text-xs text-muted-foreground">per {sub.billingCycle.toLowerCase()}</p>
                  </div>
                  <Badge variant="outline" className={cn(
                    'text-xs',
                    sub.status === 'ACTIVE' ? 'border-success/50 text-success bg-success/10' : 'border-warning/50 text-warning bg-warning/10'
                  )}>
                    {STATUS_LABEL[sub.status]}
                  </Badge>
                </div>
              </div>

              {sub.branchCount != null && (
                <p className="text-xs text-muted-foreground">
                  This is the price locked in when this plan was purchased — it doesn&apos;t change if the catalog price below does.
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="bg-background/60 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Billed through</p>
                  <p className="font-medium text-sm">{PLATFORM_LABEL[sub.platform]}</p>
                </div>
                <div className="bg-background/60 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">{sub.autoRenew ? 'Renews on' : 'Access until'}</p>
                  <p className="font-medium text-sm">{formatDate(sub.endDate)}</p>
                </div>
                <div className="bg-background/60 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Auto-renew</p>
                  <p className="font-medium text-sm">{sub.autoRenew ? 'On' : 'Off'}</p>
                </div>
                <div className="bg-background/60 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Branches built</p>
                  <p className="font-medium text-sm">
                    {quota ? `${quota.activeBranches} of ${quota.maxBranches}` : '—'}
                  </p>
                </div>
              </div>

              {sub.statusNote && (
                <div className="flex items-start gap-2 text-sm bg-warning/10 text-warning-foreground px-4 py-3 rounded-lg">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{sub.statusNote}</span>
                </div>
              )}

              {(sub.platform === 'IOS' || sub.platform === 'ANDROID') && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-background/60 px-4 py-3 rounded-lg">
                  <Smartphone className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Changing branch count, payment method, or cancelling is managed from the GymsEra mobile app on
                    {sub.platform === 'IOS' ? ' iOS' : ' Android'} — the store, not this dashboard, owns that subscription.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {noActiveSub && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="p-5 flex items-center gap-3">
              <Layers className="h-5 w-5 text-warning" />
              <p className="text-sm font-medium">
                No active subscription yet. Subscribe from the GymsEra mobile app, or request a manual plan below.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Account under review notice */}
        {tenant && tenant.status !== 'ACTIVE' && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Account Under Review</p>
                <p className="text-muted-foreground mt-0.5">Our team is reviewing your application. Once approved, your dashboard will be fully activated. This typically takes 1–2 business days.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reference pricing — the real, single catalog every platform reads
            from. Read-only here: there is no web checkout yet, so this is
            "what plans exist and cost" rather than something to click. */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Store className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">GymsEra Plan Catalog</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Branch-count pricing — the same catalog the mobile app purchases from. Purchasing itself happens in the app.
          </p>
          {catalogLoading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="font-medium px-4 py-2.5">Branches</th>
                      <th className="font-medium px-4 py-2.5">Monthly</th>
                      <th className="font-medium px-4 py-2.5">Annual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((plan) => {
                      const isCurrent = sub?.branchCount === plan.branchCount && sub?.status === 'ACTIVE'
                      return (
                        <tr key={plan.id} className={cn('border-b last:border-0', isCurrent && 'bg-primary/5')}>
                          <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                            {plan.branchCount} {plan.branchCount === 1 ? 'branch' : 'branches'}
                            {isCurrent && <Badge className="bg-primary text-primary-foreground text-xs">Current</Badge>}
                          </td>
                          <td className="px-4 py-2.5">{formatCurrency(plan.monthlyPrice, plan.currency)}</td>
                          <td className="px-4 py-2.5">{formatCurrency(plan.annualPrice, plan.currency)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Manual / invoice plans — only while there's no real (store-
            verified) subscription in the way; host.controller.js's own
            guard refuses this request otherwise, so this stays hidden
            rather than offering something that would just fail. */}
        {!hasRealSubscription && (
          <>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Request a Manual Plan</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                For tenants billed by invoice or bank transfer instead of a store purchase — not the self-serve catalog above.
              </p>

              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Bank Transfer Details
                  </CardTitle>
                  <CardDescription>Send payment, then select a plan below</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="bg-muted p-3 rounded-lg space-y-2 font-mono text-xs">
                    {Object.entries(BANK_DETAILS).map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-2 items-center">
                        <span className="text-muted-foreground">{label}:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-right select-all">{value}</span>
                          <button onClick={() => copyToClipboard(value, label)} className="text-muted-foreground hover:text-primary transition-colors">
                            {copiedField === label ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 items-start text-xs text-muted-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>Please email your transaction proof with your Tenant ID to support@gymsera.com after transfer.</span>
                  </div>
                </CardContent>
              </Card>

              {packagesLoading ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-lg" />)}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {packages.map((pkg) => (
                    <Card key={pkg.id}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{pkg.name}</CardTitle>
                        <CardDescription>{pkg.description}</CardDescription>
                        <div className="pt-1">
                          <span className="text-2xl font-bold">{formatCurrency(pkg.price)}</span>
                          <span className="text-muted-foreground text-sm ml-1">/ {pkg.billingCycle?.toLowerCase()}</span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-3">
                          Up to {pkg.maxBranches} {pkg.maxBranches === 1 ? 'branch' : 'branches'}
                        </p>
                        <Button className="w-full" onClick={() => handleSelect(pkg)}>
                          Request this plan
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Request Manual Plan"
        description={`Request "${selectedPkg?.name}"? Your existing subscription (if any) will be replaced and this takes effect immediately, pending payment confirmation.`}
        confirmLabel="Confirm Request"
        variant="default"
        onConfirm={() => selectedPkg && mutation.mutate(selectedPkg)}
        loading={mutation.isPending}
      />
    </>
  )
}
