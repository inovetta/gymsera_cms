'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, MoreHorizontal, CreditCard, Clock, DollarSign, GitBranch } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatusBadge } from '@/components/features/status-badge'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { EmptyState } from '@/components/features/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { plansApi } from '@/lib/api/plans'
import { gymApi } from '@/lib/api/gym'
import { MembershipPlan } from '@/types'
import { formatCurrency, formatDuration } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const planSchema = z.object({
  name: z.string().min(2, 'Name required'),
  description: z.string().optional(),
  branchId: z.string().optional(),
  durationType: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  durationValue: z.coerce.number().min(1),
  price: z.coerce.number().min(0),
  joiningFee: z.coerce.number().min(0),
  securityFee: z.coerce.number().min(0),
  visitLimit: z.coerce.number().optional(),
  freezeLimitDays: z.coerce.number().min(0),
  isTrial: z.boolean(),
})

type PlanForm = z.infer<typeof planSchema>

const durationColors: Record<string, string> = {
  DAILY: 'from-blue-500 to-blue-600',
  WEEKLY: 'from-green-500 to-green-600',
  MONTHLY: 'from-purple-500 to-purple-600',
  QUARTERLY: 'from-orange-500 to-orange-600',
  YEARLY: 'from-rose-500 to-rose-600',
}

function PlanCard({ plan, onEdit, onDelete, onToggle }: {
  plan: MembershipPlan
  onEdit: (p: MembershipPlan) => void
  onDelete: (p: MembershipPlan) => void
  onToggle: (p: MembershipPlan) => void
}) {
  const gradient = durationColors[plan.durationType] || 'from-gray-500 to-gray-600'

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className={`bg-gradient-to-r ${gradient} p-4 text-white`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">{plan.name}</h3>
            <p className="text-white/80 text-sm">{formatDuration(plan.durationType, plan.durationValue)}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/20">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(plan)}>Edit Plan</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggle(plan)}>
                {plan.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(plan)}>Delete Plan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-3xl font-bold mt-2">{formatCurrency(Number(plan.price))}</p>
      </div>
      <CardContent className="p-4 space-y-3">
        {plan.branchId && (
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge variant="outline" className="text-xs">{plan.branch?.branchName ?? 'Branch-specific'}</Badge>
          </div>
        )}
        {!plan.branchId && (
          <Badge variant="secondary" className="text-xs">Gym-wide</Badge>
        )}
        {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}

        <div className="grid grid-cols-2 gap-2 text-sm">
          {Number(plan.joiningFee) > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Joining: {formatCurrency(Number(plan.joiningFee))}</span>
            </div>
          )}
          {Number(plan.securityFee) > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Security: {formatCurrency(Number(plan.securityFee))}</span>
            </div>
          )}
          {plan.visitLimit && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{plan.visitLimit} visits</span>
            </div>
          )}
          {plan.freezeLimitDays > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Freeze: {plan.freezeLimitDays}d</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <StatusBadge status={plan.status} />
          {plan.isTrial && <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full">Trial</span>}
        </div>
      </CardContent>
    </Card>
  )
}

export default function PlansPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<MembershipPlan | null>(null)
  const [deletePlan, setDeletePlan] = useState<MembershipPlan | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => plansApi.getHostPlans(),
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
  })
  const branches = branchesData?.data?.branches ?? []

  const form = useForm<PlanForm>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '', description: '', durationType: 'MONTHLY', durationValue: 1,
      price: 0, joiningFee: 0, securityFee: 0, freezeLimitDays: 0, isTrial: false,
    },
  })

  const createMutation = useMutation({
    mutationFn: (payload: PlanForm) => plansApi.createPlan(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setDialogOpen(false)
      form.reset()
      toast({ title: 'Plan created successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create plan', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PlanForm }) => plansApi.updatePlan(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setDialogOpen(false)
      setEditPlan(null)
      toast({ title: 'Plan updated successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update plan', variant: 'destructive' }),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => plansApi.togglePlanStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      toast({ title: 'Plan status updated' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => plansApi.deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setDeletePlan(null)
      toast({ title: 'Plan deleted' })
    },
  })

  const openCreate = () => {
    setEditPlan(null)
    form.reset({ name: '', description: '', branchId: 'gym-wide', durationType: 'MONTHLY', durationValue: 1, price: 0, joiningFee: 0, securityFee: 0, freezeLimitDays: 0, isTrial: false })
    setDialogOpen(true)
  }

  const openEdit = (plan: MembershipPlan) => {
    setEditPlan(plan)
    form.reset({
      name: plan.name,
      description: plan.description || '',
      branchId: plan.branchId || 'gym-wide',
      durationType: plan.durationType,
      durationValue: plan.durationValue,
      price: Number(plan.price),
      joiningFee: Number(plan.joiningFee),
      securityFee: Number(plan.securityFee),
      visitLimit: plan.visitLimit,
      freezeLimitDays: plan.freezeLimitDays,
      isTrial: plan.isTrial,
    })
    setDialogOpen(true)
  }

  const onSubmit = (values: PlanForm) => {
    const payload = { ...values, branchId: values.branchId === 'gym-wide' ? null : values.branchId || null }
    if (editPlan) {
      updateMutation.mutate({ id: editPlan.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const plans = data?.data?.plans ?? []

  return (
    <>
      <Header title="Membership Plans" description="Manage pricing and membership tiers" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Membership Plans"
          description={`${plans.length} plan${plans.length !== 1 ? 's' : ''} total`}
          action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create Plan</Button>}
        />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
          </div>
        ) : plans.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No plans yet"
            description="Create your first membership plan to start enrolling members"
            action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create Plan</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={openEdit}
                onDelete={setDeletePlan}
                onToggle={(p) => toggleMutation.mutate(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPlan ? 'Edit Plan' : 'Create Membership Plan'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan Name *</FormLabel>
                    <FormControl><Input placeholder="Monthly Basic" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea placeholder="Plan details..." rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" /> Branch</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ''}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Gym-wide (applies to all branches)" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="gym-wide">Gym-wide (all branches)</SelectItem>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.branchName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Gym-wide plans are shown to all members regardless of branch.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="durationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="DAILY">Daily</SelectItem>
                          <SelectItem value="WEEKLY">Weekly</SelectItem>
                          <SelectItem value="MONTHLY">Monthly</SelectItem>
                          <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                          <SelectItem value="YEARLY">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="durationValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration Value *</FormLabel>
                      <FormControl><Input type="number" min="1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (PKR) *</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="joiningFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Joining Fee</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="securityFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Security Fee</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="visitLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Visit Limit (optional)</FormLabel>
                      <FormControl><Input type="number" min="0" placeholder="Unlimited" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="freezeLimitDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Freeze Limit (days)</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="isTrial"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="text-sm font-medium">Trial Plan</FormLabel>
                      <p className="text-xs text-muted-foreground">Mark this as a free trial offer</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deletePlan}
        onOpenChange={(open) => !open && setDeletePlan(null)}
        title="Delete Plan"
        description={`Are you sure you want to delete "${deletePlan?.name}"? This action cannot be undone.`}
        confirmLabel="Delete Plan"
        onConfirm={() => deletePlan && deleteMutation.mutate(deletePlan.id)}
        loading={deleteMutation.isPending}
      />
    </>
  )
}
