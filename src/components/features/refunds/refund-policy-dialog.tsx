'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { refundsApi, type RefundPolicy, type RefundPolicyBulkResult } from '@/lib/api/refunds'
import { organizationsApi } from '@/lib/api/organizations'
import { resolveApiError } from '@/lib/api/error-copy'
import { useToast } from '@/hooks/use-toast'

const POLICY_KEY = ['refund-policy'] as const
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'

/** "" = no limit; otherwise a whole number of days from 1 to 3650. */
export const refundWindowError = (value: string): string | null => {
  if (value.trim() === '') return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 3650) return 'A whole number of days from 1 to 3650, or empty for no limit'
  return null
}

/** The toast after a bulk write: how many branches changed, and how many were skipped (no refund grant there). */
export const bulkResultMessage = (r: RefundPolicyBulkResult): string => {
  const updated = r.updatedBranchIds.length
  const skipped = r.skippedBranchIds.length
  const base = `Saved for ${updated} branch${updated === 1 ? '' : 'es'}.`
  return skipped ? `${base} ${skipped} branch${skipped === 1 ? ' was' : 'es were'} skipped: you cannot refund there.` : base
}

const isBulk = (d: unknown): d is RefundPolicyBulkResult => !!d && Array.isArray((d as RefundPolicyBulkResult).updatedBranchIds)

/**
 * NEW-253 (R-103), enterprise D12: the refund policy belongs to each branch. Pick a branch, or
 * "Apply to all branches" (every branch where you may refund; the server skips the others).
 * New branches start with refunds off. Off: members never see "Ask for refund" and the cancel
 * dialog never offers a refund. The server answers 403 to someone without a direct refund grant.
 */
export function RefundPolicyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [branchId, setBranchId] = useState('')
  const [applyToAll, setApplyToAll] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [windowDays, setWindowDays] = useState('')

  const policiesQuery = useQuery({ queryKey: POLICY_KEY, queryFn: () => refundsApi.getPolicies(), enabled: open, retry: false })
  const branchesQuery = useQuery({ queryKey: ['branches'], queryFn: () => organizationsApi.getBranches(), enabled: open })
  const policies: RefundPolicy[] = policiesQuery.data?.data?.branches ?? []
  const names = new Map((branchesQuery.data?.data?.branches ?? []).map((b) => [b.id, b.branchName]))
  const label = (p: RefundPolicy) => p.branchName ?? names.get(p.branchId) ?? 'Branch'

  // Open on the first branch; a branch change shows that branch's own policy.
  useEffect(() => {
    if (!open) return
    setApplyToAll(false)
    if (!branchId && policies[0]) setBranchId(policies[0].branchId)
  }, [open, policies, branchId])
  useEffect(() => {
    const p = policies.find((x) => x.branchId === branchId)
    if (!p) return
    setAllowed(p.refundsAllowed)
    setWindowDays(p.refundWindowDays == null ? '' : String(p.refundWindowDays))
  }, [branchId, policiesQuery.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const windowError = refundWindowError(windowDays)
  const mutation = useMutation({
    mutationFn: () =>
      refundsApi.updatePolicy(applyToAll ? { applyToAllBranches: true } : { branchId }, {
        refundsAllowed: allowed,
        refundWindowDays: windowDays.trim() === '' ? null : Number(windowDays),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: POLICY_KEY })
      queryClient.invalidateQueries({ queryKey: ['refund-quote'] })
      onOpenChange(false)
      toast({ title: 'Refund policy saved', ...(isBulk(res?.data) ? { description: bulkResultMessage(res.data) } : {}) })
    },
    onError: (err) => toast({ title: 'Error', description: resolveApiError(err).message, variant: 'destructive' }),
  })

  const noBranch = !applyToAll && !branchId
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund policy</DialogTitle>
          <DialogDescription>
            Each branch has its own policy. When refunds are on, staff can return the payment when they cancel, and
            members can ask for a refund after cancelling. New branches start with refunds off.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="refund-branch">Branch</Label>
            <select
              id="refund-branch"
              className={selectClass}
              value={branchId}
              disabled={applyToAll || policies.length === 0}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {policies.length === 0 && <option value="">No branch you can refund at</option>}
              {policies.map((p) => (
                <option key={p.branchId} value={p.branchId}>{label(p)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="refund-apply-all">Apply to all branches</Label>
            <Switch id="refund-apply-all" checked={applyToAll} onCheckedChange={setApplyToAll} />
          </div>
          {applyToAll && (
            <p className="text-xs text-muted-foreground" data-testid="refund-apply-all-note">
              Every branch where you may refund gets this policy. Branches where you may not are left as they are.
            </p>
          )}
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
          <Button type="button" disabled={!!windowError || noBranch || policiesQuery.isLoading} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
