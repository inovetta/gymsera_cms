'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, CheckCircle, XCircle, Inbox, ShieldCheck } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { StatusBadge } from '@/components/features/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { paymentsApi } from '@/lib/api/payments'
import { gymApi } from '@/lib/api/gym'
import { Payment } from '@/types'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'

const paymentSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  paymentFor: z.enum(['MEMBERSHIP', 'TRAINER', 'PRODUCT', 'OTHER']),
  amount: z.coerce.number().min(1, 'Amount must be greater than 0'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'WALLET', 'ONLINE', 'POS']),
  branchId: z.string().optional(),
  notes: z.string().optional(),
})

type PaymentForm = z.infer<typeof paymentSchema>

const STATUS_TABS = [
  { value: 'all',            label: 'All' },
  { value: 'PENDING',        label: 'Pending' },
  { value: 'STAFF_COLLECTED', label: 'Collected' },
  { value: 'COMPLETED',      label: 'Approved' },
  { value: 'FAILED',         label: 'Rejected' },
]

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING:         { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-800' },
    STAFF_COLLECTED: { label: 'Collected', cls: 'bg-blue-100 text-blue-800' },
    COMPLETED:       { label: 'Approved',  cls: 'bg-green-100 text-green-800' },
    FAILED:          { label: 'Rejected',  cls: 'bg-red-100 text-red-800' },
    REFUNDED:        { label: 'Refunded',  cls: 'bg-purple-100 text-purple-800' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-800' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
}

export default function PaymentsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isGymHost } = useAuth()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [recordOpen, setRecordOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['payments', statusFilter, page],
    queryFn: () => paymentsApi.getPayments({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      page,
      limit: 20,
    }),
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
  })
  const branches = branchesData?.data?.branches ?? []

  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { userId: '', paymentFor: 'MEMBERSHIP', amount: 0, method: 'CASH', notes: '' },
  })

  const recordMutation = useMutation({
    mutationFn: (payload: PaymentForm) => paymentsApi.recordPayment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      setRecordOpen(false)
      form.reset()
      toast({ title: 'Payment recorded successfully' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to record payment', variant: 'destructive' }),
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'collect' | 'verify' | 'reject' }) =>
      paymentsApi.paymentAction(id, { action }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      const msgs = { collect: 'Payment marked as collected', verify: 'Payment approved', reject: 'Payment rejected' }
      toast({ title: msgs[vars.action] })
    },
    onError: (err: any) => toast({
      title: 'Error',
      description: err?.response?.data?.message || 'Failed to update payment',
      variant: 'destructive',
    }),
  })

  const columns: Column<Payment>[] = [
    {
      key: 'user',
      header: 'Member',
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {row.user?.fullName ? getInitials(row.user.fullName) : 'M'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-sm">{row.user?.fullName ?? row.userId}</p>
            <p className="text-xs text-muted-foreground">{row.paymentFor}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (row) => <span className="font-semibold text-sm">{formatCurrency(row.amount)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      cell: (row) => (
        <span className="text-xs bg-secondary px-2 py-0.5 rounded-full font-medium">{row.method}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="space-y-1">
          <PaymentStatusBadge status={row.status} />
          {row.status === 'STAFF_COLLECTED' && (
            <p className="text-xs text-muted-foreground">
              Collected {row.collectedAt ? formatDate(row.collectedAt) : ''}
            </p>
          )}
          {row.status === 'COMPLETED' && (
            <p className="text-xs text-muted-foreground">
              Approved {row.verifiedAt ? formatDate(row.verifiedAt) : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'proof',
      header: 'Proof',
      cell: (row) => row.proofUrl
        ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View</a>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: 'date',
      header: 'Date',
      cell: (row) => <span className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (row) => {
        if (row.status === 'COMPLETED' || row.status === 'FAILED' || row.status === 'REFUNDED') {
          return <span className="text-muted-foreground text-xs">—</span>
        }

        return (
          <div className="flex items-center gap-1">
            {/* Staff collect — available when PENDING, for both roles */}
            {row.status === 'PENDING' && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-blue-600 hover:text-blue-600 hover:bg-blue-50"
                onClick={(e) => { e.stopPropagation(); actionMutation.mutate({ id: row.id, action: 'collect' }) }}
                title="Mark as Collected (Step 1)"
              >
                <Inbox className="h-4 w-4" />
              </Button>
            )}

            {/* Tenant final approve — GYM_HOST only, works on PENDING or STAFF_COLLECTED */}
            {isGymHost && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-success hover:text-success hover:bg-success/10"
                onClick={(e) => { e.stopPropagation(); actionMutation.mutate({ id: row.id, action: 'verify' }) }}
                title={row.status === 'STAFF_COLLECTED' ? 'Final Approval (Step 2)' : 'Approve'}
              >
                {row.status === 'STAFF_COLLECTED'
                  ? <ShieldCheck className="h-4 w-4" />
                  : <CheckCircle className="h-4 w-4" />
                }
              </Button>
            )}

            {/* Reject — both roles */}
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); actionMutation.mutate({ id: row.id, action: 'reject' }) }}
              title="Reject"
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <>
      <Header title="Payments" description="Manage member payments and transactions" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Payments"
          action={
            <Button onClick={() => setRecordOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          }
        />

        {/* 2-step verification info banner */}
        <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-primary/5 text-sm">
          <p className="font-medium text-primary mb-1">2-Step Payment Verification</p>
          <div className="text-muted-foreground space-y-0.5">
            <p><span className="font-medium text-blue-600">Step 1 (Staff):</span> Click <Inbox className="inline h-3.5 w-3.5 mx-0.5" /> to mark payment as collected after receiving cash/proof.</p>
            {isGymHost && (
              <p><span className="font-medium text-green-600">Step 2 (You):</span> Click <ShieldCheck className="inline h-3.5 w-3.5 mx-0.5" /> to give final approval — this activates the member's subscription.</p>
            )}
            {!isGymHost && (
              <p><span className="font-medium">Step 2 (Gym Host):</span> The gym owner will give final approval to activate subscriptions.</p>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <TabsList>
                {STATUS_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-4">
            <DataTable
              columns={columns}
              data={(data?.data?.payments ?? []) as Payment[]}
              loading={isLoading}
              emptyTitle="No payments found"
              emptyDescription="No payment records match the current filter"
              page={page}
              totalPages={data?.pagination?.totalPages ?? 1}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => recordMutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User ID *</FormLabel>
                    <FormControl><Input placeholder="Member user ID (UUID)" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="paymentFor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment For *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="MEMBERSHIP">Membership</SelectItem>
                          <SelectItem value="TRAINER">Trainer</SelectItem>
                          <SelectItem value="PRODUCT">Product</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="branchId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.branchName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (PKR) *</FormLabel>
                      <FormControl><Input type="number" min="1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Method *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                          <SelectItem value="CARD">Card</SelectItem>
                          <SelectItem value="WALLET">Wallet</SelectItem>
                          <SelectItem value="ONLINE">Online</SelectItem>
                          <SelectItem value="POS">POS</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl><Textarea placeholder="Optional notes..." rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isGymHost && (
                <p className="text-xs text-muted-foreground bg-green-50 border border-green-200 rounded p-2">
                  As gym host, your payments are automatically approved and subscriptions activated immediately.
                </p>
              )}
              {!isGymHost && (
                <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                  This payment will go to the collect box. Mark it as collected after receiving cash, then the gym host will give final approval.
                </p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRecordOpen(false)}>Cancel</Button>
                <Button type="submit" loading={recordMutation.isPending}>Record Payment</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
