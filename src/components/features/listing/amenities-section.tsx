'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { asStringList, changedFields, EQUIPMENT_AMENITIES, FACILITY_AMENITIES } from '@/lib/listing/content'
import { SaveBar } from './section-card'
import { useListingSave } from './use-listing-save'
import type { SectionEditorProps } from './types'

/** Equipment and facilities (mobile EditAmenitiesScreen), saved as `facilitiesJson`. */
export function AmenitiesSection({ branchId, branch, onClose }: SectionEditorProps) {
  const { save, saving, error, approval } = useListingSave(branchId)
  const [selected, setSelected] = useState<string[]>(asStringList(branch.facilitiesJson))

  const known = new Set<string>([...EQUIPMENT_AMENITIES, ...FACILITY_AMENITIES])
  // Values saved by an older editor (e.g. "wifi") stay visible and selectable instead of being dropped.
  const other = selected.filter((a) => !known.has(a))

  const toggle = (name: string) =>
    setSelected((current) => (current.includes(name) ? current.filter((a) => a !== name) : [...current, name]))

  const patch = changedFields(branch, { facilitiesJson: selected })
  const dirty = Object.keys(patch).length > 0

  const group = (label: string, names: readonly string[]) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {names.map((name) => (
          <Button
            key={name}
            type="button"
            size="sm"
            variant={selected.includes(name) ? 'default' : 'outline'}
            aria-pressed={selected.includes(name)}
            onClick={() => toggle(name)}
          >
            {name}
          </Button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {group('Equipment', EQUIPMENT_AMENITIES)}
      {group('Facilities', FACILITY_AMENITIES)}
      {other.length > 0 && group('Other', other)}
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        approval={approval}
        onSave={async () => {
          if (await save(patch, 'Amenities saved')) onClose()
        }}
        onCancel={onClose}
      />
    </div>
  )
}
