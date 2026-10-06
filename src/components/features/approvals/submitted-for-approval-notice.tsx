import Link from 'next/link'
import { Clock } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface SubmittedForApprovalNoticeProps {
  /** What was asked for, as the server summarised it. */
  summary?: string | null
}

/**
 * Shown when an action came back 202: it was sent for approval, not carried out.
 * Use with `readApprovalOutcome` so a pending request is never reported as done.
 */
export function SubmittedForApprovalNotice({ summary }: SubmittedForApprovalNoticeProps) {
  return (
    <Alert variant="warning" role="status">
      <Clock className="h-4 w-4" />
      <AlertTitle>Submitted for approval</AlertTitle>
      <AlertDescription>
        {summary ? `${summary} was sent for approval.` : 'Your request was sent for approval.'} Nothing has changed yet
        — it will be carried out once someone approves it.{' '}
        <Link href="/gym/approvals?tab=mine" className="font-medium underline underline-offset-4">
          View your requests
        </Link>
      </AlertDescription>
    </Alert>
  )
}
