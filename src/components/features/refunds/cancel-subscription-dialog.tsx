'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { subscriptionsApi, StaffSubscriptionActionResult } from '@/lib/api/subscriptions'
import { refundsApi, refundOffer, refundAmountError, cancelRefundToast } from '@/lib/api/refunds'
import { formatCurrency } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface Props {
  subscriptionId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (result: StaffSubscriptionActionResult | undefined) => void
}

/**
 * NEW-253: Cancel asks to confirm and, when the gym gives refunds and the caller may refund,
 * "Return the payment?" with the server's prorated suggestion. Without it, cancel is as before.
 */
export function CancelSubscriptionDialog({ subscriptionId, open, onOpenChange, onDone }: Props) {
  const { toast } = useToast()
  const [withRefund, setWithRefund] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const quoteQuery = useQuery({
    queryKey: ['refund-quote', subscriptionId],
    queryFn: () => refundsApi.quote(subscriptionId!),
    enabled: open && !!subscriptionId,
    retry: false,
  })
  const offer = refundOffer(quoteQuery.data?.data)

  useEffect(() => {
    if (!open) return
    setWithRefund(false)
    setReason('')
    setAmount(offer ? offer.suggested.toFixed(2) : '')
    // Reset when the dialog opens or the quote arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteQuery.data])

  const amountError = withRefund && offer ? refundAmountError(amount, offer.max) : null

  const mutation = useMutation({
    mutationFn: () =>
      subscriptionsApi.cancelSubscription(
        subscriptionId!,
        withRefund && offer ? { amount: Number(amount), reason: reason.trim() || undefined } : undefined
      ),
    onSuccess: (res) => {
      onOpenChange(false)
      toast(cancelRefundToast(res?.data))
      onDone(res?.data)
    },
    onError: (err: any) =>
      toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="cancel-subscription-dialog">
        <DialogHeader>
          <DialogTitle>Cancel this subscription?</DialogTitle>
          <DialogDescription>The member loses access at once, including the door devices.</DialogDescription>
        </DialogHeader>

        {quoteQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : offer ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="refund-switch" className="font-medium">Return the payment?</Label>
              <Switch id="refund-switch" checked={withRefund} onCheckedChange={setWithRefund} />
            </div>
            {withRefund && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="refund-amount">Amount ({offer.currency})</Label>
                  <Input
                    id="refund-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={offer.max}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Suggested {formatCurrency(offer.suggested, offer.currency)} for the unused days; at most {formatCurrency(offer.max, offer.currency)}.
                  </p>
                  {amountError && <p className="text-xs text-destructive">{amountError}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="refund-reason">Reason (optional)</Label>
                  <Textarea id="refund-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {offer.needsApproval
                    ? 'The refund is sent for approval; the subscription is cancelled now.'
                    : 'The refund is recorded and taken off the gym’s revenue. Return the money to the member yourself.'}
                </p>
              </>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Keep subscription</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!!amountError}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {withRefund && offer ? 'Cancel and refund' : 'Cancel subscription'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
