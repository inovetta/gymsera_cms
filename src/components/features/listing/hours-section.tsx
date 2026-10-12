'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changedFields, toHourMinute } from '@/lib/listing/content'
import { SaveBar } from './section-card'
import { useListingSave } from './use-listing-save'
import type { SectionEditorProps } from './types'

/**
 * Operating hours. The server holds one opening and one closing time per branch
 * (`openingTime` / `closingTime`); the mobile editor saves the Monday pair for the same reason.
 * A closing time earlier than the opening time means the gym closes after midnight.
 */
export function HoursSection({ branchId, branch, onClose }: SectionEditorProps) {
  const { save, saving, error, approval } = useListingSave(branchId)
  const [opening, setOpening] = useState(toHourMinute(branch.openingTime))
  const [closing, setClosing] = useState(toHourMinute(branch.closingTime))

  const bothSet = opening !== '' && closing !== ''
  const patch = bothSet ? changedFields(branch, { openingTime: opening, closingTime: closing }) : {}
  const dirty = Object.keys(patch).length > 0
  const half = (opening === '') !== (closing === '')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="listing-opening">Opens at</Label>
          <Input id="listing-opening" type="time" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="listing-closing">Closes at</Label>
          <Input id="listing-closing" type="time" value={closing} onChange={(e) => setClosing(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">These hours apply to every day the branch is open.</p>
      {half && <p className="text-xs text-destructive">Set both an opening and a closing time.</p>}
      <SaveBar
        dirty={dirty}
        valid={!half}
        saving={saving}
        error={error}
        approval={approval}
        onSave={async () => {
          if (await save(patch, 'Operating hours saved')) onClose()
        }}
        onCancel={onClose}
      />
    </div>
  )
}
