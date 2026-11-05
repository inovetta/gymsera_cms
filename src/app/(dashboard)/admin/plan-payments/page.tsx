'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Header } from '@/components/layout/header'
import { PageHeader } from '@/components/features/page-header'
import { DataTable, Column } from '@/components/features/data-table'
import { PaymentProofView } from '@/components/features/payment-proof-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { adminPlanPaymentsApi } from '@/lib/api/admin-plan-payments'
import { PlanPaymentRequest, PlanPaymentStatus } from '@/lib/api/host-billing'
import { describeRequestError } from '@/lib/api/request-errors'
import { useToast } from '@/hooks/use-toast'
import { useTierLabel, branchCountLabel } from '@/hooks/use-tier-names'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

/**
 * Phase 7 P9c item D (R-95): hosts' bank-transfer payments for a GymsEra plan. The admin opens the
 * receipt, checks the money arrived, and approves (the API grants the plan: the period and price
 * come from the catalog, never from this page) or rejects with a reason the host sees.
 */
const TABS: Array<{ value: PlanPaymentStatus; label: string }> = [
  { value: 'PENDING', label: 'To check' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]
const CYCLE: Record<string, string> = { MONTHLY: 'Monthly', YEARLY: 'Annual' }

export default function AdminPlanPaymentsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const tierLabel = useTierLabel()
  const [tab, setTab] = useState<PlanPaymentStatus>('PENDING')
  const [confirming, setConfirming] = useState<PlanPaymentRequest | null>(null)
  const [rejecting, setRejecting] = useState<PlanPaymentRequest | null>(null)
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const list = useQuery({ queryKey: ['admin-plan-payments', tab], queryFn: () => adminPlanPaymentsApi.list(tab) })
  const rows = list.data?.data?.requests ?? []

  const done = (title: string) => {
    toast({ title, variant: 'success' })
    setConfirming(null)
    setRejecting(null)
    setReason('')
    setActionError(null)
    qc.invalidateQueries({ queryKey: ['admin-plan-payments'] })
  }
  const approve = useMutation({
    mutationFn: (id: string) => adminPlanPaymentsApi.approve(id),
    onSuccess: () => done('Payment approved — the plan is active'),
    onError: (err) => setActionError(describeRequestError(err, 'The payment could not be approved. Please try again.')),
  })
  const reject = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => adminPlanPaymentsApi.reject(id, why),
    onSuccess: () => done('Payment rejected'),
    onError: (err) => setActionError(describeRequestError(err, 'The payment could not be rejected. Please try again.')),
  })

  const planName = (n: number) => tierLabel(n) ?? branchCountLabel(n)
  const columns: Column<PlanPaymentRequest>[] = [
    {
      key: 'business',
      header: 'Business',
      cell: (r) => (
        <Link href={`/admin/tenants/${r.tenantId}`} className="text-sm font-medium text-primary hover:underline">
          {r.tenantName || `Organization ${r.tenantId.slice(0, 8)}…`}
        </Link>
      ),
    },
    { key: 'plan', header: 'Plan', cell: (r) => <span className="text-sm">{planName(r.branchCount)} · {CYCLE[r.billingCycle] ?? r.billingCycle}</span> },
    { key: 'amount', header: 'Amount', cell: (r) => <span className="text-sm font-semibold">{formatCurrency(Number(r.amount), r.currency)}</span> },
    { key: 'ref', header: 'Bank reference', cell: (r) => <span className="text-sm text-muted-foreground">{r.payerReference || '—'}</span> },
    { key: 'sent', header: 'Sent', cell: (r) => <span className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</span> },
    {
      key: 'receipt',
      header: 'Receipt',
      cell: (r) => <PaymentProofView proofUrl={r.hasProof ? `/api/v1/admin/plan-payments/${r.id}/proof` : null} label="View receipt" />,
    },
    {
      key: 'result',
      header: tab === 'PENDING' ? 'Actions' : 'Result',
      cell: (r) =>
        r.status === 'PENDING' ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setActionError(null); setConfirming(r) }}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => { setActionError(null); setRejecting(r) }}>Reject</Button>
          </div>
        ) : r.status === 'APPROVED' ? (
          <span className="text-sm">Active {r.periodStart ? formatDate(r.periodStart) : ''} – {r.periodEnd ? formatDate(r.periodEnd) : ''}</span>
        ) : (
          <span className="text-sm text-muted-foreground">{r.rejectionReason}</span>
        ),
    },
  ]

  return (
    <>
      <Header title="Plan payments" />
      <div className="p-6 animate-fade-in">
        <PageHeader title="Plan payments" description="Bank transfers from hosts for a GymsEra plan. Check the money arrived, then approve or reject." />
        <div className="flex gap-2 mb-4" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn('rounded-full border px-3 py-1 text-sm', tab === t.value ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <DataTable
          columns={columns}
          data={rows}
          loading={list.isLoading}
          error={list.error}
          errorWhat="the plan payments"
          onRetry={() => list.refetch()}
          emptyTitle={tab === 'PENDING' ? 'Nothing to check' : 'No payments here'}
          emptyDescription={tab === 'PENDING' ? 'New bank transfers from hosts appear here.' : 'Reviewed payments appear here.'}
        />
      </div>

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Approve this payment?</DialogTitle></DialogHeader>
          {confirming && (
            <p className="text-sm">
              {confirming.tenantName || 'This business'} gets {planName(confirming.branchCount)} ({CYCLE[confirming.billingCycle]}) for{' '}
              {formatCurrency(Number(confirming.amount), confirming.currency)}. Approve only after the money is in the account.
              <Badge variant="outline" className="ml-2 text-xs">The plan starts at once</Badge>
            </p>
          )}
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button loading={approve.isPending} onClick={() => confirming && approve.mutate(confirming.id)}>Approve and activate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject this payment</DialogTitle></DialogHeader>
          <label className="text-sm space-y-1 block">
            Reason (the host sees it)
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </label>
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3}
              loading={reject.isPending}
              onClick={() => rejecting && reject.mutate({ id: rejecting.id, why: reason.trim() })}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
