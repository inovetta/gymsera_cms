'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Layers, Users, GitBranch, Dumbbell, Clock, CreditCard, Copy, Check, AlertCircle, Building } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { tenantsApi } from '@/lib/api/tenants'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { PlatformPackage } from '@/types'
import { cn } from '@/lib/utils'

const BANK_DETAILS = {
  'Bank Name': 'Meezan Bank',
  'Account Title': 'GymsEra Technologies Pvt Ltd',
  'Account Number': '0247-0105817703',
  'IBAN': 'PK61MEZN0002470105817703',
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

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ['platform-packages'],
    queryFn: () => tenantsApi.getPackages(),
  })

  const tenant = tenantData?.data?.tenant
  const subscription = tenantData?.data?.subscription
  const packages = Array.isArray(packagesData?.data) ? packagesData.data : []
  const currentPackageId = tenant?.selectedPackageId

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const mutation = useMutation({
    mutationFn: (pkg: PlatformPackage) => tenantsApi.selectPackage(tenant!.id, pkg.id),
    onSuccess: (_, pkg) => {
      queryClient.invalidateQueries({ queryKey: ['my-tenant'] })
      setConfirmOpen(false)
      setSelectedPkg(null)
      toast({ title: `Switched to ${pkg.name} plan` })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update package', variant: 'destructive' }),
  })

  const handleSelect = (pkg: PlatformPackage) => {
    if (pkg.id === currentPackageId) return
    setSelectedPkg(pkg)
    setConfirmOpen(true)
  }

  const isLoading = tenantLoading || packagesLoading

  if (isLoading) {
    return (
      <>
        <Header title="Subscription & Billing" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-24 rounded-lg" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Subscription & Billing" description="Manage your platform subscription plan" />
      <div className="p-6 animate-fade-in space-y-6">

        {/* Current plan banner */}
        {tenant?.selectedPackage && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Layers className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Current Plan</p>
                    <p className="font-semibold text-lg">{tenant.selectedPackage.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-xl text-primary">
                    {formatCurrency(tenant.selectedPackage.price)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    per {tenant.selectedPackage.billingCycle?.toLowerCase()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!tenant?.selectedPackage && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="p-5 flex items-center gap-3">
              <Layers className="h-5 w-5 text-warning" />
              <p className="text-sm font-medium">No plan selected yet. Choose a plan below to activate your subscription.</p>
            </CardContent>
          </Card>
        )}

        {/* Subscription & Payment Status */}
        {subscription && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Subscription & Payment Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Subscription</p>
                  <Badge variant="outline" className={cn(
                    'text-xs',
                    subscription.status === 'ACTIVE' ? 'border-success/50 text-success bg-success/10' : 'border-muted-foreground/30'
                  )}>
                    {subscription.status}
                  </Badge>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Payment</p>
                  <Badge variant="outline" className={cn(
                    'text-xs',
                    subscription.paymentStatus === 'PAID'
                      ? 'border-success/50 text-success bg-success/10'
                      : subscription.paymentStatus === 'PENDING'
                      ? 'border-warning/50 text-warning bg-warning/10'
                      : 'border-destructive/50 text-destructive bg-destructive/10'
                  )}>
                    {subscription.paymentStatus === 'PENDING' ? 'Awaiting Payment' : subscription.paymentStatus}
                  </Badge>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Amount Due</p>
                  <p className="font-semibold text-sm">{formatCurrency(subscription.amount)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Billing</p>
                  <p className="font-medium text-sm capitalize">{subscription.billingCycle.toLowerCase()}</p>
                </div>
              </div>

              {subscription.paymentStatus === 'PENDING' && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-warning/10 border-b border-warning/20 px-4 py-2.5 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-warning" />
                    <p className="text-sm font-medium text-warning">Payment Pending — Transfer to our bank account</p>
                  </div>
                  <div className="p-4 space-y-2">
                    {Object.entries(BANK_DETAILS).map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground min-w-[120px]">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium font-mono">{val}</span>
                          <button onClick={() => copyToClipboard(val, label)} className="text-muted-foreground hover:text-primary transition-colors">
                            {copiedField === label ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {subscription.bankTransferRef && (
                      <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="h-4 w-4 text-success" />
                        Reference on file: <span className="font-mono font-medium text-foreground">{subscription.bankTransferRef}</span>
                      </div>
                    )}
                    {!subscription.bankTransferRef && (
                      <p className="text-xs text-muted-foreground mt-3 pt-3 border-t flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        After transferring, contact support with your transaction reference to expedite approval.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {subscription.paymentStatus === 'PAID' && (
                <div className="flex items-center gap-2 text-sm text-success bg-success/10 px-4 py-3 rounded-lg">
                  <CheckCircle className="h-4 w-4" />
                  Payment confirmed. Your subscription is active.
                </div>
              )}
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

        {/* Available packages */}
        <div>
          <h2 className="text-base font-semibold mb-4">Available Plans</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bank Transfer Details</CardTitle>
              <CardDescription>Send payment to activate/renew plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="bg-muted p-3 rounded-lg space-y-2 font-mono text-xs">
                {Object.entries(BANK_DETAILS).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{label}:</span>
                    <span className="font-semibold text-right select-all">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 items-start text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <span>
                  Please email your transaction proof with your Tenant ID to support@gymsera.com after transfer.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Plan Upgrade Selection */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Available Subscription Plans</h3>
            <p className="text-muted-foreground text-sm mt-0.5">Upgrade or renew your subscription tier</p>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {packages.map((pkg) => {
                const isCurrent = currentPackageId === pkg.id
                return (
                  <Card key={pkg.id} className={cn('relative', isCurrent && 'border-primary border-2 shadow-sm')}>
                    {isCurrent && (
                      <div className="absolute -top-3 left-4">
                        <Badge className="bg-primary text-primary-foreground text-xs">Current Plan</Badge>
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        {pkg.name}
                        {isCurrent && <CheckCircle className="h-4 w-4 text-primary" />}
                      </CardTitle>
                      <CardDescription>{pkg.description}</CardDescription>
                      <div className="pt-1">
                        <span className="text-2xl font-bold">{formatCurrency(pkg.price)}</span>
                        <span className="text-muted-foreground text-sm ml-1">
                          / {pkg.billingCycle?.toLowerCase()}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Building className="h-3.5 w-3.5" />
                          <span>Up to {pkg.maxOrganizations} organization{pkg.maxOrganizations !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <GitBranch className="h-3.5 w-3.5" />
                          <span>Up to {pkg.maxBranches} branch{pkg.maxBranches !== 1 ? 'es' : ''}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          <span>Up to {pkg.maxMembers.toLocaleString()} members</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Dumbbell className="h-3.5 w-3.5" />
                          <span>Up to {pkg.maxTrainers} trainer{pkg.maxTrainers !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <Button
                        className="w-full mt-4"
                        variant={isCurrent ? 'secondary' : 'default'}
                        disabled={isCurrent}
                        onClick={() => handleSelect(pkg)}
                      >
                        {isCurrent ? 'Current Plan' : 'Select Plan'}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Change Subscription Plan"
        description={`Switch to "${selectedPkg?.name}"? This takes effect immediately.`}
        confirmLabel="Confirm Switch"
        variant="default"
        onConfirm={() => selectedPkg && mutation.mutate(selectedPkg)}
        loading={mutation.isPending}
      />
    </>
  )
}
