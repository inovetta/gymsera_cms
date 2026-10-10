'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, CheckCircle, XCircle, Inbox, ShieldCheck, AlertCircle, Undo2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { NoAccess } from '@/components/features/no-access'
import { SubmittedForApprovalNotice } from '@/components/features/approvals/submitted-for-approval-notice'
import { paymentsApi } from '@/lib/api/payments'
import { ApprovalOutcome, readApprovalOutcome } from '@/lib/api/approvals'
import { lookupBranchMemberByEmail } from '@/lib/members/lookup'
import { gymApi } from '@/lib/api/gym'
import { Payment } from '@/types'
import { formatDate, getInitials } from '@/lib/utils'
import { formatMoney, parseAmountInput, toApiAmount } from '@/lib/money'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { describeRequestError } from '@/lib/api/request-errors'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useGymAccess } from '@/hooks/use-gym-access'
import { holdsAtBranch, holdsPermission } from '@/lib/access/menu'
import { tierAt } from '@/lib/access/tier'

// NEW-57: the staff member types the member's email; the member lookup turns it into the userId
// the server wants. The server needs a branch for every payment recorded this way, and the lookup
// is per branch, so the branch is required here too.
//
// The amount stays text until submit: it is parsed into integer minor units (PAY-02) and sent as
// a number with at most two decimals, never as a float the browser computed.
const paymentSchema = z.object({
  email: z.string().trim().min(1, 'Member email is required').email('Enter a valid email address'),
  paymentFor: z.enum(['MEMBERSHIP', 'TRAINER', 'PRODUCT', 'OTHER']),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((v) => parseAmountInput(v) !== null, 'Use digits with at most two decimals, e.g. 1500 or 1500.50')
    .refine((v) => (parseAmountInput(v) ?? 0) > 0, 'Amount must be greater than 0'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'WALLET', 'ONLINE', 'POS']),
  branchId: z.string().min(1, 'Choose a branch'),
  shift: z.string().trim().max(20, 'A shift name is at most 20 characters').optional(),
  notes: z.string().max(500, 'Notes are at most 500 characters').optional(),
})

type PaymentForm = z.infer<typeof paymentSchema>

/** Thrown by the record mutation when the lookup finds nobody with that email at the branch. */
class MemberNotFoundError extends Error {}
/** The lookup call itself failed (no members.view at the branch, offline); nothing was recorded. */
class MemberLookupFailedError extends Error {}

const STATUS_TABS = [
  { value: 'all',             label: 'All' },
  { value: 'PENDING',         label: 'Pending' },
  { value: 'STAFF_COLLECTED', label: 'Collected' },
  { value: 'COMPLETED',       label: 'Approved' },
  { value: 'FAILED',          label: 'Rejected' },
]

/**
 * GET /payments rejects `status=STAFF_COLLECTED` with 422 (the list validator's enum has no such
 * value: gymsera_be/src/validators/payments.validator.js:42-45), so the Collected tab asks for the
 * latest payments and keeps the collected ones, as the mobile Payments list does. Proposed backend
 * fix: NEW-58 in docs/changes/PROMPT-3C.md.
 */
const CLIENT_FILTERED_STATUS = 'STAFF_COLLECTED'
const CLIENT_FILTER_LIMIT = 100

function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING:         { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-800' },
    STAFF_COLLECTED: { label: 'Collected', cls: 'bg-blue-100 text-blue-800' },
    COMPLETED:       { label: 'Approved',  cls: 'bg-green-100 text-green-800' },
    FAILED:          { label: 'Rejected',  cls: 'bg-red-100 text-red-800' },
    REFUNDED:        { label: 'Refunded',  cls: 'bg-purple-100 text-purple-800' },
    EXPIRED:         { label: 'Expired',   cls: 'bg-gray-100 text-gray-800' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-800' }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>
}

export default function PaymentsPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isGymHost } = useAuth()
  const { organization, contextLoading } = useGymAccess()
  // NEW-45g: what a person may do with payments comes from their permissions, not the
  // account role. The server enforces the same keys per branch (payments.controller.js).
  const can = (key: string) => holdsPermission(organization, key, 'branch')
  const canRecordAt = (branchId?: string | null) =>
    branchId ? holdsAtBranch(organization, branchId, 'payments.record') : can('payments.record')
  const canVerifyAt = (branchId?: string | null) =>
    branchId ? holdsAtBranch(organization, branchId, 'payments.verify') : can('payments.verify')
  const canRecord = can('payments.record')
  const canVerify = can('payments.verify')
  const recordsDirectly = can('payments.record.direct')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [collectTarget, setCollectTarget] = useState<Payment | null>(null)
  const [collectShift, setCollectShift] = useState('')
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  // Refund (PAY-07): goes through the approval engine, so it may answer 202.
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null)
  const [refundPartial, setRefundPartial] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [refundError, setRefundError] = useState<string | null>(null)
  const [notice, setNotice] = useState<ApprovalOutcome | null>(null)

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => gymApi.getBranches(),
  })
  const branches = branchesData?.data?.branches ?? []

  // The list needs a branch unless the caller is the owner (the server answers 400
  // otherwise). A team member picks among the branches where they may view payments;
  // the owner may leave it on "all branches".
  const listsAll = !!organization?.isOwner || isGymHost
  const viewBranches = branches.filter((b) => holdsAtBranch(organization, b.id, 'payments.view'))
  const branchOptions = listsAll ? branches : viewBranches
  const [branchChoice, setBranchChoice] = useState('')
  const chosen = branchOptions.find((b) => b.id === branchChoice)?.id
  const branchId = chosen ?? (listsAll ? undefined : viewBranches[0]?.id)
  const canList = listsAll || !!branchId
  // Opened by URL without payments.view anywhere: say so, call nothing.
  const accessKnown = !!organization || !contextLoading
  const mayView = listsAll || can('payments.view')

  const clientFiltered = statusFilter === CLIENT_FILTERED_STATUS
  const { data, isLoading, error: listError, refetch } = useQuery({
    queryKey: ['payments', statusFilter, clientFiltered ? 1 : page, branchId ?? 'all'],
    queryFn: () => paymentsApi.getPayments({
      status: statusFilter !== 'all' && !clientFiltered ? statusFilter : undefined,
      ...(branchId ? { branchId } : {}),
      page: clientFiltered ? 1 : page,
      limit: clientFiltered ? CLIENT_FILTER_LIMIT : 20,
    }),
    enabled: canList && !!organization && mayView,
  })
  const allRows = (data?.data?.payments ?? []) as Payment[]
  const rows = clientFiltered ? allRows.filter((p) => p.status === CLIENT_FILTERED_STATUS) : allRows

  const form = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { email: '', paymentFor: 'MEMBERSHIP', amount: '', method: 'CASH', branchId: '', shift: '', notes: '' },
  })

  // The branches a payment may be recorded at: where payments.record is held (the owner: all).
  const recordBranches = branches.filter((b) => canRecordAt(b.id))

  const openRecord = () => {
    // Start on the branch the list is showing (or the only branch) so staff rarely have to pick.
    const start = branchId && canRecordAt(branchId) ? branchId : recordBranches.length === 1 ? recordBranches[0].id : ''
    form.reset({ ...form.getValues(), branchId: start })
    setRecordError(null)
    setRecordOpen(true)
  }

  // One Idempotency-Key per request: a retry of the same payment (lost reply, double click)
  // reuses it, a changed payment gets a new one.
  const recordKey = useRef<{ fingerprint: string; key: string } | null>(null)
  const keyFor = (fingerprint: string) => {
    if (!recordKey.current || recordKey.current.fingerprint !== fingerprint) {
      recordKey.current = { fingerprint, key: newIdempotencyKey() }
    }
    return recordKey.current.key
  }

  const recordMutation = useMutation({
    mutationFn: async ({ email, amount, shift, notes, ...payment }: PaymentForm) => {
      const minor = parseAmountInput(amount)
      if (minor === null || minor <= 0) throw new Error('Enter an amount greater than 0, with at most two decimals.')
      let member
      try {
        member = await lookupBranchMemberByEmail(payment.branchId, email)
      } catch (error) {
        throw new MemberLookupFailedError(
          describeRequestError(error, 'Could not look up the member. Check your connection and try again.', {
            403: 'You do not have permission to look up members at this branch.',
          })
        )
      }
      if (member.kind === 'not_found') throw new MemberNotFoundError(member.message)
      const body = {
        ...payment,
        userId: member.userId,
        amount: toApiAmount(minor),
        ...(shift ? { shift } : {}),
        ...(notes ? { notes } : {}),
      }
      return paymentsApi.recordPayment(body, keyFor(JSON.stringify(body)))
    },
    onSuccess: () => {
      recordKey.current = null
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      setRecordOpen(false)
      setRecordError(null)
      form.reset()
      toast({ title: 'Payment recorded successfully' })
    },
    onError: (error) => {
      if (error instanceof MemberNotFoundError || error instanceof MemberLookupFailedError) {
        form.setError('email', { type: 'server', message: error.message })
        return
      }
      setRecordError(describeRequestError(error, 'The payment was not recorded. Check the details and try again.'))
    },
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; action: 'collect' | 'verify' | 'reject'; shift?: string; rejectedReason?: string }) =>
      paymentsApi.paymentAction(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      setCollectTarget(null)
      setRejectTarget(null)
      setActionError(null)
      const msgs = { collect: 'Payment marked as collected', verify: 'Payment approved', reject: 'Payment rejected' }
      toast({ title: msgs[vars.action] })
    },
    onError: (err) => {
      const message = describeRequestError(err, 'The payment was not updated. Refresh the list and try again.')
      // A dialog shows its own error; a one-click approve has no dialog, so it uses a toast.
      if (collectTarget || rejectTarget) setActionError(message)
      else toast({ title: 'Could not update the payment', description: message, variant: 'destructive' })
    },
  })

  const refundKey = useRef<{ fingerprint: string; key: string } | null>(null)
  const refundMutation = useMutation({
    mutationFn: ({ payment, minor, reason }: { payment: Payment; minor: number | null; reason: string }) => {
      const body = { reason, ...(minor !== null ? { amount: toApiAmount(minor) } : {}) }
      const fingerprint = JSON.stringify({ id: payment.id, ...body })
      if (!refundKey.current || refundKey.current.fingerprint !== fingerprint) {
        refundKey.current = { fingerprint, key: newIdempotencyKey() }
      }
      return paymentsApi.refundPayment(payment.id, body, refundKey.current.key)
    },
    onSuccess: (response) => {
      refundKey.current = null
      setRefundTarget(null)
      setRefundError(null)
      const outcome = readApprovalOutcome(response)
      if (outcome.pending) {
        // 202: nothing was refunded. It is waiting in the approval inbox.
        setNotice({ ...outcome, summary: outcome.summary ?? 'The refund' })
      } else {
        setNotice(null)
        toast({ title: 'Refund issued' })
      }
      queryClient.invalidateQueries({ queryKey: ['payments'] })
    },
    onError: (error) =>
      setRefundError(describeRequestError(error, 'The refund was not issued. Reload the list and try again.', {
        403: 'You do not have permission to refund payments at this branch.',
      })),
  })

  const submitRefund = () => {
    if (!refundTarget) return
    let minor: number | null = null
    if (refundPartial) {
      minor = parseAmountInput(refundAmount)
      if (minor === null || minor <= 0) {
        setRefundError('Enter the amount to refund, greater than 0 and with at most two decimals.')
        return
      }
    }
    setRefundError(null)
    refundMutation.mutate({ payment: refundTarget, minor, reason: refundReason.trim() })
  }

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
      cell: (row) => <span className="font-semibold text-sm">{formatMoney(row.amount, row.currency || 'PKR')}</span>,
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
          {row.status === 'FAILED' && row.rejectedReason && (
            <p className="text-xs text-muted-foreground">{row.rejectedReason}</p>
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
        if (row.status === 'COMPLETED') {
          // PAY-07: a refund is its own permission, with its own tier (Direct / Needs approval).
          const tier = tierAt(organization, 'payments.refund', row.branchId ?? branchId)
          if (tier === 'OFF') return <span className="text-muted-foreground text-xs">—</span>
          return (
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-purple-700 hover:text-purple-700 hover:bg-purple-50"
              title={tier === 'DIRECT' ? 'Refund' : 'Request refund'}
              onClick={(e) => {
                e.stopPropagation()
                setRefundError(null); setRefundPartial(false); setRefundAmount(''); setRefundReason(''); setRefundTarget(row)
              }}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          )
        }
        if (row.status === 'FAILED' || row.status === 'REFUNDED' || row.status === 'EXPIRED') {
          return <span className="text-muted-foreground text-xs">—</span>
        }
        const mayRecord = canRecordAt(row.branchId)
        const mayVerify = canVerifyAt(row.branchId)
        if (!mayRecord && !mayVerify) return <span className="text-muted-foreground text-xs">—</span>

        return (
          <div className="flex items-center gap-1">
            {/* Collect — payments.record, when PENDING */}
            {mayRecord && row.status === 'PENDING' && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-blue-600 hover:text-blue-600 hover:bg-blue-50"
                onClick={(e) => { e.stopPropagation(); setActionError(null); setCollectShift(''); setCollectTarget(row) }}
                title="Mark as Collected (Step 1)"
              >
                <Inbox className="h-4 w-4" />
              </Button>
            )}

            {/* Final approve — payments.verify, works on PENDING or STAFF_COLLECTED */}
            {mayVerify && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-success hover:text-success hover:bg-success/10"
                disabled={actionMutation.isPending}
                onClick={(e) => { e.stopPropagation(); actionMutation.mutate({ id: row.id, action: 'verify' }) }}
                title={row.status === 'STAFF_COLLECTED' ? 'Final Approval (Step 2)' : 'Approve'}
              >
                {row.status === 'STAFF_COLLECTED'
                  ? <ShieldCheck className="h-4 w-4" />
                  : <CheckCircle className="h-4 w-4" />
                }
              </Button>
            )}

            {/* Reject — payments.record (the same key the server asks for); needs a reason, as in the app */}
            {mayRecord && (
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => { e.stopPropagation(); setActionError(null); setRejectReason(''); setRejectTarget(row) }}
              title="Reject"
            >
              <XCircle className="h-4 w-4" />
            </Button>
            )}
          </div>
        )
      },
    },
  ]

  if (accessKnown && !mayView) {
    return (
      <>
        <Header title="Payments" description="Manage member payments and transactions" />
        <div className="p-6">
          <NoAccess what="payments" needs="View payments" />
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Payments" description="Manage member payments and transactions" />
      <div className="p-6 animate-fade-in">
        <PageHeader
          title="Payments"
          action={
            canRecord ? (
              <Button onClick={openRecord}>
                <Plus className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            ) : undefined
          }
        />

        {/* 2-step verification info banner */}
        <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-primary/5 text-sm">
          <p className="font-medium text-primary mb-1">2-Step Payment Verification</p>
          <div className="text-muted-foreground space-y-0.5">
            <p><span className="font-medium text-blue-600">Step 1 (Staff):</span> Click <Inbox className="inline h-3.5 w-3.5 mx-0.5" /> to mark payment as collected after receiving cash/proof.</p>
            {canVerify && (
              <p><span className="font-medium text-green-600">Step 2 (You):</span> Click <ShieldCheck className="inline h-3.5 w-3.5 mx-0.5" /> to give final approval — this activates the member&apos;s subscription.</p>
            )}
            {!canVerify && (
              <p><span className="font-medium">Step 2 (Approver):</span> Someone with approval rights will give final approval to activate subscriptions.</p>
            )}
          </div>
        </div>

        {branchOptions.length > 1 && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <label htmlFor="payments-branch" className="font-medium">Branch</label>
            <select
              id="payments-branch"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={branchId ?? ''}
              onChange={(e) => { setBranchChoice(e.target.value); setPage(1) }}
            >
              {listsAll && <option value="">All branches</option>}
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.branchName}</option>
              ))}
            </select>
          </div>
        )}

        {notice && (
          <div className="mb-4">
            <SubmittedForApprovalNotice summary={notice.summary} />
          </div>
        )}

        {listError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>The payments did not load</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{describeRequestError(listError, 'Could not load payments. Try again.')}</span>
              <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
            </AlertDescription>
          </Alert>
        )}

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
              data={rows}
              loading={isLoading || (!organization && contextLoading)}
              emptyTitle="No payments found"
              emptyDescription={
                clientFiltered
                  ? 'None of the latest 100 payments are waiting for final approval.'
                  : 'No payment records match the current filter'
              }
              page={clientFiltered ? 1 : page}
              totalPages={clientFiltered ? 1 : (data?.pagination?.totalPages ?? 1)}
              onPageChange={setPage}
            />
            {clientFiltered && rows.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Showing collected payments among the latest {CLIENT_FILTER_LIMIT}.</p>
            )}
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
            <form onSubmit={form.handleSubmit((v) => { setRecordError(null); recordMutation.mutate(v) })} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member email *</FormLabel>
                    <FormControl><Input type="text" inputMode="email" autoComplete="off" placeholder="member@example.com" {...field} /></FormControl>
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
                      <FormLabel>Branch *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {recordBranches.map((b) => (
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
                      <FormControl><Input type="text" inputMode="decimal" autoComplete="off" placeholder="0" {...field} /></FormControl>
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
                name="shift"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shift</FormLabel>
                    <FormControl><Input placeholder="Optional, e.g. Morning" maxLength={20} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              {recordsDirectly && (
                <p className="text-xs text-muted-foreground bg-green-50 border border-green-200 rounded p-2">
                  Your payments are automatically approved and subscriptions activated immediately.
                </p>
              )}
              {!recordsDirectly && (
                <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                  This payment will go to the collect box. Mark it as collected after receiving cash, then someone with approval rights will give final approval.
                </p>
              )}

              {recordError && (
                <p className="text-sm font-medium text-destructive" role="alert">{recordError}</p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRecordOpen(false)}>Cancel</Button>
                <Button type="submit" loading={recordMutation.isPending}>Record Payment</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Collect (step 1): optionally name the shift the money was taken in (PAY-06) */}
      <Dialog open={!!collectTarget} onOpenChange={(open) => !open && setCollectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as collected</DialogTitle>
            <DialogDescription>
              {collectTarget ? `${formatMoney(collectTarget.amount, collectTarget.currency || 'PKR')} from ${collectTarget.user?.fullName ?? 'the member'}. ` : ''}
              This records that you have the money. Someone with approval rights still gives the final approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="collect-shift">Shift (optional)</Label>
            <Input
              id="collect-shift"
              placeholder="e.g. Morning"
              maxLength={20}
              value={collectShift}
              onChange={(e) => setCollectShift(e.target.value)}
            />
          </div>
          {actionError && <p className="text-sm font-medium text-destructive" role="alert">{actionError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCollectTarget(null)}>Cancel</Button>
            <Button
              loading={actionMutation.isPending}
              onClick={() =>
                collectTarget &&
                actionMutation.mutate({ id: collectTarget.id, action: 'collect', ...(collectShift.trim() ? { shift: collectShift.trim() } : {}) })
              }
            >
              Mark as collected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund (PAY-07): full by default, or part of it; always with a reason */}
      <Dialog open={!!refundTarget} onOpenChange={(open) => !open && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {refundTarget && tierAt(organization, 'payments.refund', refundTarget.branchId ?? branchId) === 'REQUEST'
                ? 'Request a refund'
                : 'Refund payment'}
            </DialogTitle>
            <DialogDescription>
              {refundTarget ? `${formatMoney(refundTarget.amount, refundTarget.currency || 'PKR')} paid by ${refundTarget.user?.fullName ?? 'the member'}. ` : ''}
              {refundTarget && tierAt(organization, 'payments.refund', refundTarget.branchId ?? branchId) === 'REQUEST'
                ? 'Your request goes to someone with approval rights. Nothing is refunded until it is approved.'
                : 'A full refund also ends the membership it paid for.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="refund-mode" checked={!refundPartial} onChange={() => setRefundPartial(false)} />
                Refund the full amount still refundable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="refund-mode" checked={refundPartial} onChange={() => setRefundPartial(true)} />
                Refund part of it
              </label>
              {refundPartial && (
                <div className="space-y-1 pl-6">
                  <Label htmlFor="refund-amount">Amount to refund (PKR)</Label>
                  <Input
                    id="refund-amount"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason *</Label>
              <Textarea
                id="refund-reason"
                rows={3}
                maxLength={500}
                placeholder="e.g. Member moved away; membership cancelled within the trial week"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>
            {refundError && <p className="text-sm font-medium text-destructive" role="alert">{refundError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button>
            <Button
              disabled={!refundReason.trim()}
              loading={refundMutation.isPending}
              onClick={submitRefund}
            >
              {refundTarget && tierAt(organization, 'payments.refund', refundTarget.branchId ?? branchId) === 'REQUEST'
                ? 'Send request'
                : 'Refund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject: a reason is required, as in the app */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject payment</DialogTitle>
            <DialogDescription>
              {rejectTarget ? `${formatMoney(rejectTarget.amount, rejectTarget.currency || 'PKR')} from ${rejectTarget.user?.fullName ?? 'the member'}. ` : ''}
              The member is told why it was turned away.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason *</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              maxLength={500}
              placeholder="e.g. The transfer receipt does not match the amount"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          {actionError && <p className="text-sm font-medium text-destructive" role="alert">{actionError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              loading={actionMutation.isPending}
              onClick={() =>
                rejectTarget &&
                actionMutation.mutate({ id: rejectTarget.id, action: 'reject', rejectedReason: rejectReason.trim() })
              }
            >
              Reject payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
