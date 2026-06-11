'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, CheckCircle, XCircle, DollarSign, Zap, Ban, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { StatusBadge } from '@/components/features/status-badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { subscriptionsApi } from '@/lib/api/subscriptions'
import { paymentsApi } from '@/lib/api/payments'
import { MemberSubscription, Payment, Invoice } from '@/types'
import { formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useDebounce } from '@/hooks/use-debounce'
import { useToast } from '@/hooks/use-toast'

const recordPaymentSchema = z.object({
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'WALLET']),
  notes: z.string().optional(),
})
type RecordPaymentForm = z.infer<typeof recordPaymentSchema>

const freezeSchema = z.object({
  freezeFrom: z.string().min(1, 'Required'),
  freezeTo: z.string().min(1, 'Required'),
})
type FreezeForm = z.infer<typeof freezeSchema>

export default function SubscriptionsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  const [selectedSub, setSelectedSub] = useState<MemberSubscription | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [freezeOpen, setFreezeOpen] = useState(false)

  const debouncedSearch = useDebounce(search, 400)

  const { data, isLoading } = useQuery({
    queryKey: ['staff-subscriptions', statusFilter, page],
    queryFn: () => subscriptionsApi.getStaffSubscriptions({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      limit: 20,
    }),
  })

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['subscription-detail', selectedSub?.id],
    queryFn: () => subscriptionsApi.getStaffSubscription(selectedSub!.id),
    enabled: !!selectedSub?.id && detailOpen,
  })

  const recordPaymentForm = useForm<RecordPaymentForm>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { method: 'CASH', notes: '' },
  })

  const freezeForm = useForm<FreezeForm>({
    resolver: zodResolver(freezeSchema),
    defaultValues: { freezeFrom: '', freezeTo: '' },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['staff-subscriptions'] })
    queryClient.invalidateQueries({ queryKey: ['subscription-detail', selectedSub?.id] })
  }

  const activateMutation = useMutation({
    mutationFn: (id: string) => subscriptionsApi.activateSubscription(id),
    onSuccess: () => { invalidate(); toast({ title: 'Subscription activated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  const verifyMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'verify' | 'reject' }) =>
      paymentsApi.verifyOrRejectPayment(id, { action }),
    onSuccess: (_, vars) => {
      invalidate()
      toast({ title: vars.action === 'verify' ? 'Payment verified — subscription activated' : 'Payment rejected' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  const recordPaymentMutation = useMutation({
    mutationFn: (values: RecordPaymentForm) => {
      const sub = detailData?.data?.subscription ?? selectedSub!
      const plan = (sub as any).plan
      const totalAmount = plan
        ? (parseFloat(plan.price) + parseFloat(plan.joiningFee ?? 0) + parseFloat(plan.securityFee ?? 0))
        : 0
      return paymentsApi.recordPayment({
        userId: sub.userId,
        paymentFor: 'MEMBERSHIP',
        referenceEntityId: sub.id,
        method: values.method,
        amount: totalAmount,
        notes: values.notes || undefined,
      })
    },
    onSuccess: () => {
      invalidate()
      setRecordPaymentOpen(false)
      recordPaymentForm.reset()
      toast({ title: 'Payment recorded' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => subscriptionsApi.cancelSubscription(id),
    onSuccess: () => { invalidate(); toast({ title: 'Subscription cancelled' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  const freezeMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FreezeForm }) =>
      subscriptionsApi.freezeSubscription(id, payload),
    onSuccess: () => {
      invalidate()
      setFreezeOpen(false)
      freezeForm.reset()
      toast({ title: 'Subscription frozen' })
    },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  const detail = detailData?.data
  const latestPayment: Payment | null = detail?.payments?.[0] ?? null
  const invoice: Invoice | null = detail?.invoice ?? null

  const paymentBadge = (p: Payment | null | undefined) => {
    if (!p) return <Badge variant="outline" className="text-xs">No Payment</Badge>
    const variant = p.status === 'COMPLETED' ? 'success' : p.status === 'FAILED' ? 'destructive' : 'warning'
    return <Badge variant={variant as any} className="text-xs">{p.status}</Badge>
  }

  const allSubscriptions = data?.data?.subscriptions ?? []
  const pagination = data?.pagination
  const totalPages = pagination?.totalPages ?? 1

  const columns: Column<MemberSubscription>[] = [
    {
      key: 'member',
      header: 'Member',
      cell: (row) => {
        const u = (row as any).user
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={u?.profileImageUrl} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(u?.fullName ?? 'U')}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium leading-none">{u?.fullName ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{u?.email ?? row.userId.slice(0, 8) + '…'}</p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'plan',
      header: 'Plan',
      cell: (row) => <span className="text-sm font-medium">{(row as any).plan?.name ?? '—'}</span>,
    },
    {
      key: 'branch',
      header: 'Branch',
      cell: (row) => <span className="text-sm">{row.branch?.branchName ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'payment',
      header: 'Payment',
      cell: (row) => paymentBadge((row as any).latestPayment),
    },
    {
      key: 'dates',
      header: 'Period',
      cell: (row) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(row.startDate)} → {formatDate(row.endDate)}
        </span>
      ),
    },
  ]

  return (
    <>
      <Header title="Subscriptions" description="Manage all member subscriptions" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Subscriptions"
          description={`${pagination?.total ?? 0} total subscriptions`}
        />

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending Payment</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="FROZEN">Frozen</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={allSubscriptions}
          loading={isLoading}
          emptyTitle="No subscriptions found"
          emptyDescription="No subscriptions match the selected filters"
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={(sub) => { setSelectedSub(sub); setDetailOpen(true) }}
        />
      </div>

      {/* Subscription Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Subscription Detail</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : detail ? (
            <div className="space-y-5">
              {/* Member + Subscription info */}
              <div className="flex items-start gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={(detail.subscription as any).user?.profileImageUrl} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials((detail.subscription as any).user?.fullName ?? 'U')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{(detail.subscription as any).user?.fullName ?? '—'}</p>
                  <p className="text-sm text-muted-foreground">{(detail.subscription as any).user?.email}</p>
                  <p className="text-xs text-muted-foreground">{(detail.subscription as any).user?.phone}</p>
                </div>
                <StatusBadge status={detail.subscription.status} />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Plan</p>
                  <p className="font-medium">{(detail.subscription as any).plan?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Branch</p>
                  <p className="font-medium">{detail.subscription.branch?.branchName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Start Date</p>
                  <p className="font-medium">{formatDate(detail.subscription.startDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">End Date</p>
                  <p className="font-medium">{formatDate(detail.subscription.endDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Channel</p>
                  <p className="font-medium capitalize">{detail.subscription.sourceChannel?.toLowerCase() ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">QR Code</p>
                  <p className="font-mono text-xs truncate">{detail.subscription.qrCode ?? '—'}</p>
                </div>
              </div>

              <Separator />

              {/* Invoice */}
              {invoice && (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Invoice {invoice.invoiceNo}</p>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Subtotal</p>
                        <p className="font-medium">{formatCurrency(invoice.subtotal)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-semibold">{formatCurrency(invoice.totalAmount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Due</p>
                        <p className="font-medium">{invoice.dueDate ? formatDate(invoice.dueDate) : '—'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment */}
              {latestPayment && (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Payment</p>
                      <StatusBadge status={latestPayment.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Method</p>
                        <Badge variant="outline" className="text-xs mt-0.5">{latestPayment.method}</Badge>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-semibold">{formatCurrency(latestPayment.amount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Date</p>
                        <p className="font-medium">{formatDate(latestPayment.createdAt)}</p>
                      </div>
                    </div>
                    {latestPayment.proofUrl && (
                      <a
                        href={latestPayment.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline"
                      >
                        View payment proof
                      </a>
                    )}
                    {latestPayment.rejectedReason && (
                      <p className="text-xs text-destructive">Rejected: {latestPayment.rejectedReason}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                {/* Pending payment: verify or reject */}
                {latestPayment?.status === 'PENDING' && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => verifyMutation.mutate({ id: latestPayment.id, action: 'verify' })}
                      loading={verifyMutation.isPending && (verifyMutation.variables as any)?.action === 'verify'}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Verify Payment
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => verifyMutation.mutate({ id: latestPayment.id, action: 'reject' })}
                      loading={verifyMutation.isPending && (verifyMutation.variables as any)?.action === 'reject'}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject Payment
                    </Button>
                  </>
                )}

                {/* Record cash payment (for PENDING subscriptions without a verified payment) */}
                {detail.subscription.status === 'PENDING' && (
                  <Button size="sm" variant="outline" onClick={() => setRecordPaymentOpen(true)}>
                    <DollarSign className="h-4 w-4 mr-1" />
                    Record Cash Payment
                  </Button>
                )}

                {/* Manual activate (bypass payment) */}
                {detail.subscription.status === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => activateMutation.mutate(detail.subscription.id)}
                    loading={activateMutation.isPending}
                  >
                    <Zap className="h-4 w-4 mr-1" />
                    Activate (No Payment)
                  </Button>
                )}

                {/* Freeze */}
                {detail.subscription.status === 'ACTIVE' && (
                  <Button size="sm" variant="outline" onClick={() => setFreezeOpen(true)}>
                    Freeze
                  </Button>
                )}

                {/* Cancel */}
                {['PENDING', 'ACTIVE', 'FROZEN'].includes(detail.subscription.status) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => cancelMutation.mutate(detail.subscription.id)}
                    loading={cancelMutation.isPending}
                  >
                    <Ban className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Cash Payment</DialogTitle>
          </DialogHeader>
          <Form {...recordPaymentForm}>
            <form onSubmit={recordPaymentForm.handleSubmit((v) => recordPaymentMutation.mutate(v))} className="space-y-4">
              <FormField
                control={recordPaymentForm.control}
                name="method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CASH">Cash</SelectItem>
                        <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                        <SelectItem value="CARD">Card</SelectItem>
                        <SelectItem value="WALLET">Wallet</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={recordPaymentForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Transaction reference, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRecordPaymentOpen(false)}>Cancel</Button>
                <Button type="submit" loading={recordPaymentMutation.isPending}>Record Payment</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Freeze Dialog */}
      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Freeze Subscription</DialogTitle>
          </DialogHeader>
          <Form {...freezeForm}>
            <form
              onSubmit={freezeForm.handleSubmit((v) =>
                freezeMutation.mutate({ id: detail?.subscription.id ?? '', payload: v })
              )}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={freezeForm.control}
                  name="freezeFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={freezeForm.control}
                  name="freezeTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFreezeOpen(false)}>Cancel</Button>
                <Button type="submit" loading={freezeMutation.isPending}>Freeze</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
