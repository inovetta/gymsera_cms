'use client'

import { ExternalLink } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { GYMSERA_APP_URL } from '@/lib/app-link'

interface BranchLimitDialogProps {
  open: boolean
  branchName: string
  /** The server's sentence (403 branch_limit_reached / account_over_quota). */
  message: string
  isOverQuota: boolean
  loading?: boolean
  onTryAgain: () => void
  onClose: () => void
}

/**
 * Shown only after the server refused the branch with 403 (UX-19), as the mobile
 * `_buyCapacityForThisBranch` dialog does. The mobile app opens the store; the web sells no
 * store plans, so it explains and sends the owner to the app. What was typed is kept, and
 * "Try again" sends the same branch once capacity has been added.
 */
export function BranchLimitDialog({ open, branchName, message, isOverQuota, loading, onTryAgain, onClose }: BranchLimitDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>One more branch needed</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {isOverQuota ? (
                <>
                  <p>{message}</p>
                  <p>Your branch is saved — add capacity in the GymsEra app, then try again.</p>
                </>
              ) : (
                <>
                  <p>
                    Your plan is fully used, so &quot;{branchName}&quot; needs one more branch on your subscription.
                  </p>
                  <p>
                    Everything you&apos;ve filled in is saved. Plans are managed in the GymsEra app: add a branch to your
                    plan there, then come back and try again.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Not now
          </Button>
          <Button variant="outline" onClick={onTryAgain} loading={loading}>
            Try again
          </Button>
          <a
            href={GYMSERA_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants()}
          >
            Continue in the GymsEra app
            <ExternalLink className="h-4 w-4" />
          </a>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
