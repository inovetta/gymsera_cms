'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { refundsApi } from '@/lib/api/refunds'
import { useToast } from '@/hooks/use-toast'

const POLICY_KEY = ['refund-policy'] as const

/** "" = no limit; otherwise a whole number of days from 1 to 3650. */
export const refundWindowError = (value: string): string | null => {
  if (value.trim() === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 3650) return 'A whole number of days from 1 to 3650, or empty for no limit'
  return null
}

/**
 * NEW-253 (R-103): the gym's refund policy. Off: members never see "Ask for refund" and the cancel
 * dialog never offers a refund. Changing it needs a direct refund permission (Owner / Org admin);
 * the server answers 403 to anyone else.
 */
export function RefundPolicyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [allowed, setAllowed] = useState(false)
  const [windowDays, setWindowDays] = useState('')

  const policyQuery = useQuery({ queryKey: POLICY_KEY, queryFn: () => refundsApi.getPolicy(), enabled: open, retry: false })
  useEffect(() => {
    const p = policyQuery.data?.data
    if (!open || !p) return
    setAllowed(p.refundsAllowed)
    setWindowDays(p.refundWindowDays == null ? '' : String(p.refundWindowDays))
  }, [open, policyQuery.data])

  const windowError = refundWindowError(windowDays)
  const mutation = useMutation({
    mutationFn: () =>
      refundsApi.updatePolicy({ refundsAllowed: allowed, refundWindowDays: windowDays.trim() === '' ? null : Number(windowDays) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: POLICY_KEY })
      queryClient.invalidateQueries({ queryKey: ['refund-quote'] })
      onOpenChange(false)
      toast({ title: 'Refund policy saved' })
    },
    onError: (err: any) =>
      toast({ title: 'Error', description: err?.response?.data?.message ?? 'Failed', variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund policy</DialogTitle>
          <DialogDescription>
            When refunds are on, staff can return the payment when they cancel, and members can ask for a refund after cancelling.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="refunds-allowed">Refunds allowed</Label>
            <Switch id="refunds-allowed" checked={allowed} onCheckedChange={setAllowed} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="refund-window">Refund window (days after payment)</Label>
            <Input id="refund-window" type="number" min="1" step="1" placeholder="No limit" value={windowDays}
              disabled={!allowed} onChange={(e) => setWindowDays(e.target.value)} />
            {windowError && <p className="text-xs text-destructive">{windowError}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button type="button" disabled={!!windowError || policyQuery.isLoading} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
