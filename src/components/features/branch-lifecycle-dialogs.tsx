'use client'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { StorePlanNotice } from '@/lib/api/host'

/** One reason the API gave for refusing a delete (P5b, R-81): a code and how many. */
export interface DeleteBlockReason {
  code: string
  count: number
}

/** What a 409 branch_delete_blocked / organization_delete_blocked says. Null for any other error. */
export interface DeleteBlocked {
  isOrganization: boolean
  branchId: string | null
  reasons: DeleteBlockReason[]
}

export function deleteBlockedFrom(error: unknown): DeleteBlocked | null {
  const data = (error as { response?: { status?: number; data?: { code?: string; data?: any } } })?.response?.data
  if (data?.code !== 'branch_delete_blocked' && data?.code !== 'organization_delete_blocked') return null
  const body = data.data ?? {}
  const reasons: DeleteBlockReason[] = (Array.isArray(body.reasons) ? body.reasons : [])
    .filter((r: any) => r && r.code)
    .map((r: any) => ({ code: String(r.code), count: Number(r.count) || 0 }))
  return { isOrganization: data.code === 'organization_delete_blocked', branchId: body.branchId ?? null, reasons }
}

/** The host's words for a reason (mobile branch_lifecycle_dialogs.dart deleteBlockReasonText). */
export function deleteBlockReasonText({ code, count: n }: DeleteBlockReason): string {
  const plural = (one: string, many: string) => (n === 1 ? one : many)
  switch (code) {
    case 'active_memberships':
      return `${n} ${plural('member', 'members')} with time left on a paid membership`
    case 'upcoming_bookings':
      return `${n} upcoming ${plural('booking', 'bookings')}`
    case 'pending_payments':
      return `${n} ${plural('payment', 'payments')} waiting for approval`
    case 'cash_collected_payments':
      return `${n} cash ${plural('payment', 'payments')} collected but not approved yet`
    default:
      return `${n} ${plural('item', 'items')} still open`
  }
}

interface DeleteBlockedDialogProps {
  blocked: DeleteBlocked | null
  pausing: boolean
  onPause: () => void
  onClose: () => void
}

/**
 * The API refused to delete (P5b item 3, R-81): why, with the counts, and "Pause instead". A paused
 * branch is hidden from travellers; members, plans and history stay. No refund is made here.
 */
export function DeleteBlockedDialog({ blocked, pausing, onPause, onClose }: DeleteBlockedDialogProps) {
  const title = blocked?.isOrganization ? "This organization can't be deleted yet" : "This branch can't be deleted yet"
  return (
    <Dialog open={!!blocked} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Why the delete was refused</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {(blocked?.reasons ?? []).map((r) => <li key={r.code}>{deleteBlockReasonText(r)}</li>)}
        </ul>
        <p className="text-sm text-muted-foreground">
          Approve or reject the payments, and wait until the memberships and bookings end. Or pause instead: a paused
          branch is hidden from travellers, and its members, plans and history stay as they are.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pausing}>Close</Button>
          {blocked?.branchId && (
            <Button onClick={onPause} loading={pausing}>Pause instead</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * After the organization went with its last branch (P5b item 7, R-81): the GymsEra plan still renews at
 * the store. The API says so and where to cancel; nothing is cancelled for the host.
 */
export function StorePlanNoticeDialog({ notice, onClose }: { notice: StorePlanNotice | null; onClose: () => void }) {
  const url = notice && /^https:\/\//i.test(notice.manageUrl) ? notice.manageUrl : null
  return (
    <AlertDialog open={!!notice} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Your plan still renews</AlertDialogTitle>
          <AlertDialogDescription>{notice?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose}>OK</Button>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={onClose} className={buttonVariants()}>
              Open subscriptions
            </a>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
