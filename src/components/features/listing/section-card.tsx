'use client'

import { ReactNode } from 'react'
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SubmittedForApprovalNotice } from '@/components/features/approvals/submitted-for-approval-notice'
import type { ApprovalOutcome } from '@/lib/api/approvals'

interface SectionCardProps {
  id: string
  title: string
  icon: LucideIcon
  /** What is set now, in a line (mobile's right-hand value). */
  summary: string
  open: boolean
  onToggle: () => void
  /** False hides the Edit control: the person may look but not change. */
  canEdit: boolean
  children?: ReactNode
}

/** One row of the listing hub: a summary line that opens its editor in place. */
export function SectionCard({ id, title, icon: Icon, summary, open, onToggle, canEdit, children }: SectionCardProps) {
  return (
    <Card data-testid={`section-${id}`}>
      <div className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="truncate text-xs text-muted-foreground" data-testid={`summary-${id}`}>{summary}</p>
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`editor-${id}`}
            aria-label={`${open ? 'Close' : 'Edit'} ${title}`}
          >
            {open ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
            {open ? 'Close' : 'Edit'}
          </Button>
        )}
      </div>
      {open && canEdit && (
        <div id={`editor-${id}`} className="space-y-4 border-t p-4">
          {children}
        </div>
      )}
    </Card>
  )
}

interface SaveBarProps {
  dirty: boolean
  valid?: boolean
  saving: boolean
  error: string | null
  approval: ApprovalOutcome | null
  onSave: () => void
  onCancel: () => void
}

/**
 * Save and Cancel for a section, plus what came back: the server's message when it refused, the
 * shared "sent for approval" notice when it answered 202.
 */
export function SaveBar({ dirty, valid = true, saving, error, approval, onSave, onCancel }: SaveBarProps) {
  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive" data-testid="save-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {approval?.pending && <SubmittedForApprovalNotice summary={approval.summary} />}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={!dirty || !valid || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
