'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, CreditCard, MoreHorizontal } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { EmptyState } from '@/components/features/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { billingPlansApi } from '@/lib/api/billing-plans'
import { BillingPlan, ProviderSyncStatus } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const planSchema = z.object({
  branchCount: z.coerce.number().min(1),
  monthlyPrice: z.coerce.number().min(0),
  annualPrice: z.coerce.number().min(0),
  iosMonthlyProductId: z.string().optional(),
  iosAnnualProductId: z.string().optional(),
  androidProductId: z.string().optional(),
  androidMonthlyBasePlanId: z.string().optional(),
  androidAnnualBasePlanId: z.string().optional(),
})

type PlanForm = z.infer<typeof planSchema>

const SYNC_COLOR: Record<ProviderSyncStatus, string> = {
  SYNCED: 'text-success border-success/30 bg-success/10',
  PENDING: 'text-warning border-warning/30 bg-warning/10',
  MISMATCH: 'text-destructive border-destructive/30 bg-destructive/10',
  NOT_CONFIGURED: 'text-muted-foreground border-border bg-muted',
}

function SyncStatusBadge({ label, status }: { label: string; status: ProviderSyncStatus }) {
  return (
    <Badge variant="outline" className={cn('text-xs font-normal', SYNC_COLOR[status])}>
      {label}: {status.replace('_', ' ').toLowerCase()}
    </Badge>
  )
}

function BillingPlanCard({
  plan,
  onEdit,
  onSyncStripe,
  onMarkSynced,
  syncingId,
}: {
  plan: BillingPlan
  onEdit: (p: BillingPlan) => void
  onSyncStripe: (p: BillingPlan) => void
  onMarkSynced: (p: BillingPlan, provider: 'ios' | 'android') => void
  syncingId: string | null
}) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-xl">
              {plan.branchCount} {plan.branchCount === 1 ? 'branch' : 'branches'}
            </h3>
            <p className="text-white/70 text-sm">{plan.isActive ? 'Active in catalog' : 'Inactive'}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/20">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(plan)}>Edit Plan</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSyncStripe(plan)} disabled={syncingId === plan.id}>
                Sync Stripe Price
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMarkSynced(plan, 'ios')}>Mark iOS Synced</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMarkSynced(plan, 'android')}>Mark Android Synced</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-4xl font-bold mt-3">{formatCurrency(plan.monthlyPrice, plan.currency)}</p>
        <p className="text-white/70 text-sm mt-0.5">per month · {formatCurrency(plan.annualPrice, plan.currency)}/year</p>
      </div>

      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          <SyncStatusBadge label="iOS" status={plan.iosSyncStatus} />
          <SyncStatusBadge label="Android" status={plan.androidSyncStatus} />
          <SyncStatusBadge label="Stripe" status={plan.stripeSyncStatus} />
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p>iOS: {plan.iosMonthlyProductId || '—'} / {plan.iosAnnualProductId || '—'}</p>
          <p>Android: {plan.androidProductId || '—'}</p>
          <p>Stripe: {plan.stripeMonthlyPriceId || '—'}</p>
          {plan.stripeLastSyncedAt && <p>Stripe last synced {formatDate(plan.stripeLastSyncedAt)}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export default function BillingPlansPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<BillingPlan | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => billingPlansApi.getPlans(),
  })

  const form = useForm<PlanForm>({
    resolver: zodResolver(planSchema),
    defaultValues: { branchCount: 1, monthlyPrice: 0, annualPrice: 0 },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['billing-plans'] })

  const createMutation = useMutation({
    mutationFn: (payload: PlanForm) => billingPlansApi.createPlan(payload),
    onSuccess: () => {
      invalidate()
      setDialogOpen(false)
      form.reset()
      toast({ title: 'Billing plan created' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create billing plan', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PlanForm }) => billingPlansApi.updatePlan(id, payload),
    onSuccess: () => {
      invalidate()
      setDialogOpen(false)
      setEditPlan(null)
      toast({ title: 'Billing plan updated', description: 'Catalog price changed — existing subscribers keep their locked-in price.' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update billing plan', variant: 'destructive' }),
  })

  const syncStripeMutation = useMutation({
    mutationFn: (id: string) => billingPlansApi.syncStripe(id),
    onMutate: (id) => setSyncingId(id),
    onSuccess: () => {
      invalidate()
      toast({ title: 'Stripe price synced', description: 'New Stripe Prices created — existing subscribers are unaffected.' })
    },
    onError: () => toast({ title: 'Error', description: 'Stripe sync failed — check STRIPE_SECRET_KEY is configured.', variant: 'destructive' }),
    onSettled: () => setSyncingId(null),
  })

  const markSyncedMutation = useMutation({
    mutationFn: ({ id, provider }: { id: string; provider: 'ios' | 'android' }) => billingPlansApi.markSynced(id, provider),
    onSuccess: () => {
      invalidate()
      toast({ title: 'Marked as synced' })
    },
  })

  const openCreate = () => {
    setEditPlan(null)
    form.reset({ branchCount: 1, monthlyPrice: 0, annualPrice: 0 })
    setDialogOpen(true)
  }

  const openEdit = (plan: BillingPlan) => {
    setEditPlan(plan)
    form.reset({
      branchCount: plan.branchCount,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      iosMonthlyProductId: plan.iosMonthlyProductId || '',
      iosAnnualProductId: plan.iosAnnualProductId || '',
      androidProductId: plan.androidProductId || '',
      androidMonthlyBasePlanId: plan.androidMonthlyBasePlanId || '',
      androidAnnualBasePlanId: plan.androidAnnualBasePlanId || '',
    })
    setDialogOpen(true)
  }

  const onSubmit = (values: PlanForm) => {
    if (editPlan) {
      updateMutation.mutate({ id: editPlan.id, payload: values })
    } else {
      createMutation.mutate(values)
    }
  }

  const plans = (data?.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <>
      <Header title="Billing Plans" description="The central GymsEra catalog — feeds iOS, Android, and the website alike" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Billing Plans"
          description="Branch-count tiers and their per-provider product mappings. One catalog, every client."
          action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Tier</Button>}
        />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-lg" />)}
          </div>
        ) : plans.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No billing plans yet"
            description="Add the first branch-count tier to the GymsEra catalog"
            action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Tier</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <BillingPlanCard
                key={plan.id}
                plan={plan}
                onEdit={openEdit}
                onSyncStripe={(p) => syncStripeMutation.mutate(p.id)}
                onMarkSynced={(p, provider) => markSyncedMutation.mutate({ id: p.id, provider })}
                syncingId={syncingId}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editPlan ? 'Edit Billing Plan' : 'Add Billing Plan Tier'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="branchCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branches *</FormLabel>
                      <FormControl><Input type="number" min="1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="monthlyPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly (PKR) *</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="annualPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annual (PKR) *</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {editPlan && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  Changing the price here only updates GymsEra&apos;s own catalog — it never touches a live Stripe
                  Price or an existing subscriber&apos;s locked-in price. Use &quot;Sync Stripe Price&quot; from the
                  card menu afterward to push it to Stripe.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="iosMonthlyProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>iOS Monthly Product ID</FormLabel>
                      <FormControl><Input placeholder="branches_3_monthly" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="iosAnnualProductId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>iOS Annual Product ID</FormLabel>
                      <FormControl><Input placeholder="branches_3_annual" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="androidProductId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Android Product ID</FormLabel>
                    <FormControl><Input placeholder="branches_3" {...field} /></FormControl>
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="androidMonthlyBasePlanId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Android Monthly Base Plan</FormLabel>
                      <FormControl><Input placeholder="branches_3_monthly" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="androidAnnualBasePlanId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Android Annual Base Plan</FormLabel>
                      <FormControl><Input placeholder="branches_3_annual" {...field} /></FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                  {editPlan ? 'Save Changes' : 'Create Plan'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
