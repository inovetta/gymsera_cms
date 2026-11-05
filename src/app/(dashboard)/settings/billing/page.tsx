'use client'

import { useQuery } from '@tanstack/react-query'
import { Layers, Clock, Store, Smartphone, Info } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/features/error-state'
import { BillingNoticeList } from '@/components/features/billing-notices'
import { httpStatus } from '@/lib/api/request-errors'
import { tenantsApi } from '@/lib/api/tenants'
import { hostBillingApi, CatalogPlan, SubscriptionLapse } from '@/lib/api/host-billing'
import { LapsedPlanCard } from '@/components/features/lapsed-plan-card'
import { HostPlanPayment } from '@/components/features/host-plan-payment'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { TenantSubscription } from '@/types'
import { useTierLabel, branchCountLabel } from '@/hooks/use-tier-names'

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
  const tierLabel = useTierLabel()

  const { data: tenantData, isLoading: tenantLoading } = useQuery({
    queryKey: ['my-tenant'],
    queryFn: () => tenantsApi.getMyTenant(),
  })

  // The SAME endpoint the mobile app's MySubscriptionScreen reads — one
  // real entitlement, not a CMS-specific view of it. 404s (via isError)
  // when the tenant has no active subscription at all, which is a normal
  // state here, not a failure to show.
  const { data: subData, isLoading: subLoading, error: subError, refetch: refetchSub } = useQuery({
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

  // 404 is the normal "no plan yet" answer (R-21). Any other failure is a failed load, never "no plan".
  // NEW-180 (P9): a plan that ended answers 200 with `entitled: false` and `lapse` (P7c, R-82): it is
  // shown as what it is (LapsedPlanCard), never as the current plan.
  const lapsedSub = (subData?.data as { entitled?: boolean; lapse?: SubscriptionLapse | null; endDate?: string; platform?: string } | undefined)
  const lapsed = lapsedSub?.entitled === false
  const lapse = lapsed ? lapsedSub?.lapse ?? null : null
  const noActiveSub = (!!subError && httpStatus(subError) === 404) || (lapsed && !lapse)
  const subLoadFailed = !!subError && !noActiveSub

  const tenant = tenantData?.data?.tenant
  const sub = lapsed ? undefined : subData?.data
  const quota = quotaData?.data
  const rawCatalog = catalogData?.data
  const catalog: CatalogPlan[] = Array.isArray(rawCatalog)
    ? rawCatalog
    : (rawCatalog && typeof rawCatalog === 'object' && 'plans' in rawCatalog && Array.isArray((rawCatalog as { plans: unknown }).plans)
      ? (rawCatalog as { plans: CatalogPlan[] }).plans
      : [])

  const isLoading = tenantLoading || subLoading

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
        <BillingNoticeList subscription={sub as unknown as Record<string, unknown> | undefined} activeBranches={quota?.activeBranches} />

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
                    {/* BUG-24: the tier the app shows (API tierName), then the branch count it covers. */}
                    <p className="font-semibold text-lg">
                      {/* P9c: a legacy package plan now arrives with its package name. */}
                      {sub.branchCount != null
                        ? tierLabel(sub.branchCount) ?? branchCountLabel(sub.branchCount)
                        : sub.package?.name ? `${sub.package.name} (legacy package)` : 'Legacy package'}
                    </p>
                    {sub.branchCount != null && tierLabel(sub.branchCount) && (
                      <p className="text-xs text-muted-foreground">{branchCountLabel(sub.branchCount)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-bold text-xl text-primary">{formatCurrency(sub.amount, sub.currency || undefined)}</p>
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

        {lapse && <LapsedPlanCard lapse={lapse} endDate={lapsedSub?.endDate} platform={lapsedSub?.platform} />}

        {subLoadFailed && (
          <ErrorState error={subError} what="your current plan" onRetry={() => refetchSub()} compact />
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
            Branch-count pricing — the same catalog the mobile app purchases from. Buy in the app, or pay by bank transfer below.
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
                            {plan.tierName ? `${plan.tierName} · ` : ''}{branchCountLabel(plan.branchCount)}
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

        {/* P9c item D (R-95): pay for a plan by bank transfer here; the API decides when it is
            refused (a store plan that renews) and what it costs. */}
        <HostPlanPayment />
      </div>
    </>
  )
}
