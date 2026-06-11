'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Mail, Phone, Calendar, Shield, CheckCircle, XCircle, Zap, DollarSign } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { StatusBadge } from '@/components/features/status-badge'
import { DataTable, Column } from '@/components/features/data-table'
import { ConfirmDialog } from '@/components/features/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usersApi } from '@/lib/api/users'
import { subscriptionsApi } from '@/lib/api/subscriptions'
import { paymentsApi } from '@/lib/api/payments'
import { attendanceApi } from '@/lib/api/attendance'
import { MemberSubscription, AttendanceLog, Payment } from '@/types'
import { formatDate, formatCurrency, getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const recordPaymentSchema = z.object({
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'WALLET']),
  notes: z.string().optional(),
})
type RecordPaymentForm = z.infer<typeof recordPaymentSchema>

export default function MemberDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const userId = params.id as string

  const [suspendDialog, setSuspendDialog] = useState(false)
  const [activateDialog, setActivateDialog] = useState(false)
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [actionSub, setActionSub] = useState<MemberSubscription | null>(null)

  const recordPaymentForm = useForm<RecordPaymentForm>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { method: 'CASH', notes: '' },
  })

  const { data: userData, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => usersApi.getUser(userId),
  })

  const { data: subscriptionsData, isLoading: subsLoading } = useQuery({
    queryKey: ['user-subscriptions', userId],
    queryFn: () => subscriptionsApi.getStaffSubscriptions({ userId, limit: 20 }),
  })

  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
    queryKey: ['user-attendance', userId],
    queryFn: () => attendanceApi.getAttendance({ userId, limit: 10 }),
  })

  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['user-payments', userId],
    queryFn: () => paymentsApi.getPayments({ userId, limit: 10 }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user-subscriptions', userId] })
    queryClient.invalidateQueries({ queryKey: ['user-payments', userId] })
  }

  const statusMutation = useMutation({
    mutationFn: (status: string) => usersApi.updateUserStatus(userId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', userId] })
      setSuspendDialog(false)
      setActivateDialog(false)
      toast({ title: 'Member status updated' })
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' }),
  })

  const activateSubMutation = useMutation({
    mutationFn: (id: string) => subscriptionsApi.activateSubscription(id),
    onSuccess: () => { invalidate(); toast({ title: 'Subscription activated' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  const cancelSubMutation = useMutation({
    mutationFn: (id: string) => subscriptionsApi.cancelSubscription(id),
    onSuccess: () => { invalidate(); toast({ title: 'Subscription cancelled' }) },
    onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  const verifyPaymentMutation = useMutation({
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
      const plan = (actionSub as any)?.plan
      const totalAmount = plan
        ? (parseFloat(plan.price) + parseFloat(plan.joiningFee ?? 0) + parseFloat(plan.securityFee ?? 0))
        : 0
      return paymentsApi.recordPayment({
        userId,
        paymentFor: 'MEMBERSHIP',
        referenceEntityId: actionSub!.id,
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

  const user = userData?.data?.user

  const subsColumns: Column<MemberSubscription>[] = [
    { key: 'plan', header: 'Plan', cell: (row) => <span className="font-medium text-sm">{(row as any).plan?.name ?? row.membershipPlan?.name ?? '—'}</span> },
    { key: 'branch', header: 'Branch', cell: (row) => <span className="text-sm">{row.branch?.branchName ?? '—'}</span> },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'payment',
      header: 'Payment',
      cell: (row) => {
        const p = (row as any).latestPayment as Payment | null
        if (!p) return <Badge variant="outline" className="text-xs">—</Badge>
        const variant = p.status === 'COMPLETED' ? 'success' : p.status === 'FAILED' ? 'destructive' : 'warning'
        return <Badge variant={variant as any} className="text-xs">{p.status}</Badge>
      },
    },
    { key: 'start', header: 'Start', cell: (row) => <span className="text-sm">{formatDate(row.startDate)}</span> },
    { key: 'end', header: 'Expires', cell: (row) => <span className="text-sm">{formatDate(row.endDate)}</span> },
    {
      key: 'actions',
      header: '',
      cell: (row) => {
        const latestPayment = (row as any).latestPayment as Payment | null
        return (
          <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
            {latestPayment?.status === 'PENDING' && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-success hover:text-success"
                  onClick={() => verifyPaymentMutation.mutate({ id: latestPayment.id, action: 'verify' })}
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => verifyPaymentMutation.mutate({ id: latestPayment.id, action: 'reject' })}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </>
            )}
            {row.status === 'PENDING' && !latestPayment && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => { setActionSub(row); setRecordPaymentOpen(true) }}
              >
                <DollarSign className="h-3.5 w-3.5 mr-1" />
                Pay
              </Button>
            )}
            {row.status === 'PENDING' && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-primary hover:text-primary"
                onClick={() => activateSubMutation.mutate(row.id)}
              >
                <Zap className="h-3.5 w-3.5 mr-1" />
                Activate
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  const attendanceColumns: Column<AttendanceLog>[] = [
    { key: 'checkIn', header: 'Check In', cell: (row) => <span className="text-sm">{formatDate(row.checkInTime, 'MMM dd, yyyy HH:mm')}</span> },
    { key: 'checkOut', header: 'Check Out', cell: (row) => <span className="text-sm">{row.checkOutTime ? formatDate(row.checkOutTime, 'MMM dd, yyyy HH:mm') : '—'}</span> },
    { key: 'branch', header: 'Branch', cell: (row) => <span className="text-sm">{row.branch?.branchName ?? '—'}</span> },
  ]

  const paymentsColumns: Column<Payment>[] = [
    { key: 'for', header: 'For', cell: (row) => <span className="text-sm font-medium">{row.paymentFor}</span> },
    { key: 'amount', header: 'Amount', cell: (row) => <span className="text-sm font-semibold">{formatCurrency(row.amount)}</span> },
    { key: 'method', header: 'Method', cell: (row) => <Badge variant="outline" className="text-xs">{row.method}</Badge> },
    { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'proof',
      header: 'Proof',
      cell: (row) => row.proofUrl
        ? <a href={row.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View</a>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => row.status === 'PENDING'
        ? (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-success hover:text-success"
              onClick={(e) => { e.stopPropagation(); verifyPaymentMutation.mutate({ id: row.id, action: 'verify' }) }}>
              Verify
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); verifyPaymentMutation.mutate({ id: row.id, action: 'reject' }) }}>
              Reject
            </Button>
          </div>
        ) : null,
    },
    { key: 'date', header: 'Date', cell: (row) => <span className="text-sm">{formatDate(row.createdAt)}</span> },
  ]

  if (isLoading) {
    return (
      <>
        <Header title="Member Detail" />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      </>
    )
  }

  if (!user) return null

  return (
    <>
      <Header title={user.fullName} />
      <div className="p-6 animate-fade-in space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Members
        </Button>

        {/* Member Header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user.profileImageUrl} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                  {getInitials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold">{user.fullName}</h2>
                  <StatusBadge status={user.status} />
                  {user.isVerified && <Badge variant="success" className="text-xs">Verified</Badge>}
                </div>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>{user.email}</span>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <span>{user.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Joined {formatDate(user.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Shield className="h-4 w-4 mr-2" />
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {user.status !== 'ACTIVE' && (
                      <DropdownMenuItem onClick={() => setActivateDialog(true)}>Activate Account</DropdownMenuItem>
                    )}
                    {user.status === 'ACTIVE' && (
                      <DropdownMenuItem className="text-destructive" onClick={() => setSuspendDialog(true)}>
                        Suspend Account
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="subscriptions">
          <TabsList>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
          </TabsList>

          <TabsContent value="subscriptions" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Subscriptions</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  columns={subsColumns}
                  data={(subscriptionsData?.data?.subscriptions ?? []) as MemberSubscription[]}
                  loading={subsLoading}
                  emptyTitle="No subscriptions"
                  emptyDescription="This member has no subscription history"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Payment History</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  columns={paymentsColumns}
                  data={(paymentsData?.data?.payments ?? []) as Payment[]}
                  loading={paymentsLoading}
                  emptyTitle="No payments"
                  emptyDescription="This member has no payment history"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attendance" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Attendance History</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  columns={attendanceColumns}
                  data={(attendanceData?.data?.logs ?? []) as AttendanceLog[]}
                  loading={attendanceLoading}
                  emptyTitle="No attendance records"
                  emptyDescription="No check-in history found"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ConfirmDialog
          open={suspendDialog}
          onOpenChange={setSuspendDialog}
          title="Suspend Account"
          description="Are you sure you want to suspend this member? They will not be able to access the gym."
          confirmLabel="Suspend"
          onConfirm={() => statusMutation.mutate('SUSPENDED')}
          loading={statusMutation.isPending}
        />
        <ConfirmDialog
          open={activateDialog}
          onOpenChange={setActivateDialog}
          title="Activate Account"
          description="Activate this member's account?"
          confirmLabel="Activate"
          variant="default"
          onConfirm={() => statusMutation.mutate('ACTIVE')}
          loading={statusMutation.isPending}
        />

        {/* Record Payment Dialog */}
        <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
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
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                      <FormControl><Input placeholder="Transaction reference, etc." {...field} /></FormControl>
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
      </div>
    </>
  )
}
