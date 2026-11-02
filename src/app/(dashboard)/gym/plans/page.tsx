'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, MoreHorizontal, CreditCard, Clock, DollarSign, GitBranch, Eye, EyeOff } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { StatusBadge } from '@/components/features/status-badge'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/features/empty-state'
import { ErrorState } from '@/components/features/error-state'
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
import { formatCurrency } from '@/lib/utils'
import { ERROR_COPY_FALLBACK } from '@/lib/api/error-copy'
import { plainRequestError } from '@/lib/api/request-errors'
import { branchesWithoutVisiblePlan, isLastVisiblePlan, isTravellerVisible, planDisplayName, planDurationLabel } from '@/lib/plans/plan-display'
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
  // NEW-112: Show to Travellers. On by default, as in the app (create_or_edit_plan_dialog.dart).
  isPublic: z.boolean(),
})

type PlanForm = z.infer<typeof planSchema>

const durationColors: Record<string, string> = {
  DAILY: 'from-blue-500 to-blue-600',
  WEEKLY: 'from-green-500 to-green-600',
  MONTHLY: 'from-purple-500 to-purple-600',
  QUARTERLY: 'from-orange-500 to-orange-600',
  YEARLY: 'from-rose-500 to-rose-600',
}

const LAST_VISIBLE_PLAN = ERROR_COPY_FALLBACK.last_visible_plan.en
const VISIBLE_PLAN_REQUIRED = ERROR_COPY_FALLBACK.visible_plan_required.en

function PlanCard({ plan, onEdit, onDelete, onToggle, onTogglePublic }: {
  plan: MembershipPlan
  onEdit: (p: MembershipPlan) => void
  onDelete: (p: MembershipPlan) => void
  onToggle: (p: MembershipPlan) => void
  onTogglePublic: (p: MembershipPlan) => void
}) {
  const gradient = durationColors[plan.durationType] || 'from-gray-500 to-gray-600'
  const visible = isTravellerVisible(plan)
  const money = (amount: number | string) => formatCurrency(Number(amount), plan.currency || undefined)

  return (
    <Card data-testid={`plan-card-${plan.id}`} className="overflow-hidden hover:shadow-md transition-shadow">
      <div className={`bg-gradient-to-r ${gradient} p-4 text-white`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">{planDisplayName(plan.name)}</h3>
            <p className="text-white/80 text-sm">{planDurationLabel(plan.durationType, plan.durationValue)}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/20" aria-label={`Actions for ${planDisplayName(plan.name)}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(plan)}>Edit Plan</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onTogglePublic(plan)}>
                {plan.isPublic ? 'Hide from Travellers' : 'Show to Travellers'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggle(plan)}>
                {plan.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(plan)}>Delete Plan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-3xl font-bold mt-2">{money(plan.price)}</p>
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {plan.branchId ? (
            <>
              <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
              <Badge variant="outline" className="text-xs">{plan.branch?.branchName ?? 'Branch-specific'}</Badge>
            </>
          ) : (
            <Badge variant="secondary" className="text-xs">Gym-wide</Badge>
          )}
          {/* NEW-112: travellers see a plan only when it is active and shown to them (R-77). */}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${visible ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
            {visible ? <Eye className="h-3 w-3" aria-hidden="true" /> : <EyeOff className="h-3 w-3" aria-hidden="true" />}
            {visible ? 'Shown to travellers' : 'Hidden from travellers'}
          </span>
        </div>
        {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}

        <div className="grid grid-cols-2 gap-2 text-sm">
          {Number(plan.joiningFee) > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Joining: {money(plan.joiningFee)}</span>
            </div>
          )}
          {Number(plan.securityFee) > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" />
              <span>Security: {money(plan.securityFee)}</span>
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
  const [publicTarget, setPublicTarget] = useState<MembershipPlan | null>(null)
  // The last plan travellers can see somewhere: refused before sending, with the API's own copy.
  const [mustStayVisible, setMustStayVisible] = useState<string | null>(null)

  const { data, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['plans'],
    queryFn: () => plansApi.getHostPlans(),
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
  })
  const branches = branchesData?.data?.branches ?? []
  const activeBranches = branches.filter((b) => (b.status || '').toUpperCase() === 'ACTIVE')

  const form = useForm<PlanForm>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '', description: '', durationType: 'MONTHLY', durationValue: 1,
      price: 0, joiningFee: 0, securityFee: 0, freezeLimitDays: 0, isTrial: false, isPublic: true,
    },
  })
  const failed = (fallback: string) => (err: unknown) =>
    toast({ title: 'Error', description: plainRequestError(err, fallback), variant: 'destructive' })

  const createMutation = useMutation({
    mutationFn: (payload: PlanForm) => plansApi.createPlan(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setDialogOpen(false)
      form.reset()
      toast({ title: 'Plan created successfully' })
    },
    onError: failed('The plan was not created. Please try again.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PlanForm }) => plansApi.updatePlan(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setDialogOpen(false)
      setEditPlan(null)
      toast({ title: 'Plan updated successfully' })
    },
    onError: failed('The plan was not saved. Please try again.'),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => plansApi.togglePlanStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      toast({ title: 'Plan status updated' })
    },
    onError: failed('The plan status was not changed. Please try again.'),
  })

  const publicMutation = useMutation({
    mutationFn: (plan: MembershipPlan) => plansApi.togglePlanPublic(plan.id),
    onSuccess: (_res, plan) => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setPublicTarget(null)
      toast({ title: plan.isPublic ? 'Plan hidden from travellers.' : 'Plan is now visible to travellers.' })
    },
    onError: (err) => {
      setPublicTarget(null)
      failed('The plan was not changed. Please try again.')(err)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => plansApi.deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] })
      setDeletePlan(null)
      toast({ title: 'Plan deleted' })
    },
    onError: (err) => {
      setDeletePlan(null)
      failed('The plan was not deleted. Please try again.')(err)
    },
  })

  const openCreate = () => {
    setEditPlan(null)
    form.reset({ name: '', description: '', branchId: 'gym-wide', durationType: 'MONTHLY', durationValue: 1, price: 0, joiningFee: 0, securityFee: 0, freezeLimitDays: 0, isTrial: false, isPublic: true })
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
      isPublic: !!plan.isPublic || mustStay(plan),
    })
    setDialogOpen(true)
  }

  const onSubmit = (values: PlanForm) => {
    const payload = { ...values, branchId: values.branchId === 'gym-wide' ? undefined : values.branchId || undefined }
    if (editPlan) {
      updateMutation.mutate({ id: editPlan.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const plans = data?.data?.plans ?? []
  const branchIds = activeBranches.map((b) => b.id)
  const mustStay = (plan: MembershipPlan) => isLastVisiblePlan(plan, plans, branchIds)
  const notLive = branchesWithoutVisiblePlan(activeBranches, plans)
  const editLocked = !!editPlan && mustStay(editPlan)

  // The currency the price is typed in: the plan's own, else the chosen branch's, else the first branch's.
  const chosenBranchId = form.watch('branchId')
  const formCurrency =
    (editPlan?.currency && editPlan.branchId === (chosenBranchId === 'gym-wide' ? undefined : chosenBranchId) ? editPlan.currency : null) ||
    activeBranches.find((b) => b.id === chosenBranchId)?.currency ||
    editPlan?.currency ||
    branches[0]?.currency ||
    null

  const guard = (plan: MembershipPlan, run: () => void) => {
    if (mustStay(plan)) setMustStayVisible(LAST_VISIBLE_PLAN)
    else run()
  }

  return (
    <>
      <Header title="Membership Plans" description="Manage pricing and membership tiers" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Membership Plans"
          description={`${plans.length} plan${plans.length !== 1 ? 's' : ''} total`}
          action={<Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create Plan</Button>}
        />

        {/* R-77: a branch is live for travellers only with at least one plan shown to them. */}
        {!isLoading && !loadError && notLive.length > 0 && (
          <Alert data-testid="branches-not-live" className="mb-4">
            <AlertDescription>
              Travellers do not see {notLive.map((b) => b.branchName).join(', ')} yet: no plan there is shown to travellers.{' '}
              {VISIBLE_PLAN_REQUIRED}
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
          </div>
        ) : loadError ? (
          <ErrorState error={loadError} what="your membership plans" onRetry={() => refetch()} />
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
                onDelete={(p) => guard(p, () => setDeletePlan(p))}
                onToggle={(p) => (p.status === 'ACTIVE' ? guard(p, () => toggleMutation.mutate(p.id)) : toggleMutation.mutate(p.id))}
                onTogglePublic={(p) => (p.isPublic ? guard(p, () => setPublicTarget(p)) : setPublicTarget(p))}
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
                          <SelectItem value="QUARTERLY">Quarterly (3 months)</SelectItem>
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
                      <FormLabel>{formCurrency ? `Price (${formCurrency}) *` : 'Price *'}</FormLabel>
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
              <FormField
                control={form.control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="text-sm font-medium">Show to Travellers</FormLabel>
                      <p className="text-xs text-muted-foreground">{editLocked ? LAST_VISIBLE_PLAN : 'Visible in the traveller listing'}</p>
                    </div>
                    <FormControl>
                      <Switch
                        aria-label="Show to Travellers"
                        checked={field.value}
                        disabled={editLocked}
                        onCheckedChange={field.onChange}
                      />
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

      {/* Show to / hide from travellers (mobile host_plans_tab.dart _togglePublic) */}
      <ConfirmDialog
        open={!!publicTarget}
        onOpenChange={(open) => !open && setPublicTarget(null)}
        title={publicTarget?.isPublic ? 'Hide from Travellers' : 'Show to Travellers'}
        description={
          publicTarget?.isPublic
            ? `Hide "${planDisplayName(publicTarget?.name)}" from travellers on GymsEra? It stays available for walk-in enrolments at the gym.`
            : `Make "${planDisplayName(publicTarget?.name)}" visible to travellers on GymsEra?`
        }
        confirmLabel={publicTarget?.isPublic ? 'Hide Plan' : 'Make Public'}
        variant="default"
        loading={publicMutation.isPending}
        onConfirm={() => publicTarget && publicMutation.mutate(publicTarget)}
      />

      <AlertDialog open={!!mustStayVisible} onOpenChange={(open) => !open && setMustStayVisible(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This plan must stay visible</AlertDialogTitle>
            <AlertDialogDescription>{mustStayVisible}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setMustStayVisible(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deletePlan}
        onOpenChange={(open) => !open && setDeletePlan(null)}
        title="Delete Plan"
        description={`Are you sure you want to delete "${planDisplayName(deletePlan?.name)}"? This action cannot be undone.`}
        confirmLabel="Delete Plan"
        onConfirm={() => deletePlan && deleteMutation.mutate(deletePlan.id)}
        loading={deleteMutation.isPending}
      />
    </>
  )
}
