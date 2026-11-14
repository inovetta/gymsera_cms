'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/features/empty-state'
import { refundsApi, refundAmountError, RefundRequestRow, REFUND_REQUESTS_KEY } from '@/lib/api/refunds'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

type Decision = { row: RefundRequestRow; decision: 'APPROVE' | 'REJECT' }

/**
 * NEW-253: members' refund requests (asked after they cancelled). Approve = the refund (the amount may be
 * lowered, never raised above what the member was offered; the server checks the balance); reject needs a reason.
 * Only a direct refunder may decide; the server answers 403 to anyone else and the message is shown.
 */
export function MemberRefundRequests() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<Decision | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const query = useQuery({ queryKey: REFUND_REQUESTS_KEY, queryFn: () => refundsApi.listRequests('PENDING'), retry: false })
  const rows = query.data?.data?.requests ?? []

  const open = (row: RefundRequestRow, decision: Decision['decision']) => {
    setTarget({ row, decision })
    setAmount(Number(row.suggestedAmount).toFixed(2))
    setReason('')
  }

  const mutation = useMutation({
    mutationFn: (d: Decision) =>
      refundsApi.decide(d.row.id, d.decision === 'APPROVE'
        ? { decision: 'APPROVE', amount: Number(amount), reason: reason.trim() || undefined }
        : { decision: 'REJECT', reason: reason.trim() }),
    onSuccess: (_res, d) => {
      setTarget(null)
      queryClient.invalidateQueries({ queryKey: REFUND_REQUESTS_KEY })
      toast(d.decision === 'APPROVE'
        ? { title: 'Refund approved', description: 'Return the money to the member.' }
        : { title: 'Refund request rejected' })
    },
    onError: (err: any) => {
      setTarget(null)
      queryClient.invalidateQueries({ queryKey: REFUND_REQUESTS_KEY })
      toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' })
    },
  })

  // The suggestion is the most the member asked for; staff may lower it (the server caps it at the balance).
  const approveError = target?.decision === 'APPROVE' ? refundAmountError(amount, Number(target.row.suggestedAmount)) : null
  const rejectError = target?.decision === 'REJECT' && reason.trim() === '' ? 'Say why, so the member knows' : null

  if (query.isLoading) return <Skeleton className="h-24 w-full" />
  if (rows.length === 0) {
    return <EmptyState icon={Wallet} title="No refund requests" description="When a member cancels and asks for a refund, it shows up here." />
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.id} data-testid="refund-request-card">
            <CardContent className="space-y-2 p-4">
              <p className="font-medium">{formatCurrency(row.suggestedAmount, row.currency)}</p>
              <p className="text-xs text-muted-foreground">Asked {formatDate(row.createdAt)}</p>
              {row.reason && <p className="text-sm">“{row.reason}”</p>}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                  onClick={() => open(row, 'REJECT')}>Reject</Button>
                <Button variant="success" size="sm" className="flex-1" onClick={() => open(row, 'APPROVE')}>Approve</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{target?.decision === 'APPROVE' ? 'Approve refund' : 'Reject refund request'}</DialogTitle>
            <DialogDescription>
              {target?.decision === 'APPROVE'
                ? 'The refund is recorded and taken off the gym’s revenue. Return the money to the member yourself.'
                : 'The subscription stays cancelled and no money is returned.'}
            </DialogDescription>
          </DialogHeader>
          {target?.decision === 'APPROVE' && (
            <div className="space-y-1">
              <Label htmlFor="approve-amount">Amount ({target.row.currency})</Label>
              <Input id="approve-amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {approveError && <p className="text-xs text-destructive">{approveError}</p>}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="decision-reason">{target?.decision === 'APPROVE' ? 'Note (optional)' : 'Reason'}</Label>
            <Textarea id="decision-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            {rejectError && <p className="text-xs text-destructive">{rejectError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Back</Button>
            <Button
              variant={target?.decision === 'APPROVE' ? 'success' : 'destructive'}
              disabled={!!approveError || !!rejectError}
              loading={mutation.isPending}
              onClick={() => target && mutation.mutate(target)}
            >
              {target?.decision === 'APPROVE' ? 'Approve refund' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
