'use client'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface LastBranchDialogProps {
  open: boolean
  branchName: string
  businessName?: string | null
  /** "Delete anyway", "Move anyway", … */
  actionLabel: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The 409 `last_branch_in_business` confirmation, worded as the mobile
 * `showLastBranchWarningDialog`: a business cannot exist without a branch, so going on
 * removes it too. Nothing is sent again until the owner confirms here.
 */
export function LastBranchDialog({ open, branchName, businessName, actionLabel, loading, onConfirm, onCancel }: LastBranchDialogProps) {
  const businessLabel = businessName && businessName.trim() ? `"${businessName}"` : 'this business'
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Last branch of this business</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                &quot;{branchName}&quot; is the last branch of {businessLabel}.
              </p>
              <p>
                Continuing will also remove {businessLabel}, because a business can&apos;t exist without a branch.
              </p>
              <p>
                The branch capacity you paid for is not lost — it goes back to your available branches and can be used
                for a new business whenever you want.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>
            {actionLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
