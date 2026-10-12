'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { changedFields, DESCRIPTION_MAX, TAGLINE_MAX } from '@/lib/listing/content'
import type { UpdateListingContentPayload } from '@/lib/api/host'
import { SaveBar } from './section-card'
import { useListingSave } from './use-listing-save'
import type { SectionEditorProps } from './types'

const toText = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** Gym name, tagline, description, established year, floor area (mobile EditBasicInfoScreen). */
export function BasicInfoSection({ branchId, branch, onClose }: SectionEditorProps) {
  const { save, saving, error, approval } = useListingSave(branchId)
  const [name, setName] = useState(toText(branch.branchName))
  const [tagline, setTagline] = useState(toText(branch.tagline))
  const [description, setDescription] = useState(toText(branch.description))
  const [year, setYear] = useState(toText(branch.establishedYear))
  const [area, setArea] = useState(toText(branch.floorArea))

  const thisYear = new Date().getFullYear()
  const yearNumber = year.trim() === '' ? undefined : Number(year)
  const areaNumber = area.trim() === '' ? undefined : Number(area)
  const yearInvalid = yearNumber !== undefined && (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > thisYear)
  const areaInvalid = areaNumber !== undefined && (!Number.isInteger(areaNumber) || areaNumber <= 0)
  const nameInvalid = name.trim().length === 0

  const draft: UpdateListingContentPayload = {
    branchName: name,
    tagline,
    description,
    ...(yearNumber !== undefined && !yearInvalid ? { establishedYear: yearNumber } : {}),
    ...(areaNumber !== undefined && !areaInvalid ? { floorArea: areaNumber } : {}),
  }
  const patch = changedFields(branch, draft)
  const dirty = Object.keys(patch).length > 0

  const onSave = async () => {
    if (await save(patch, 'Basic info saved')) onClose()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="listing-name">Gym name</Label>
        <Input id="listing-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={nameInvalid} />
        {nameInvalid && <p className="text-xs text-destructive">Gym name is required.</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="listing-tagline">Tagline</Label>
        <Input id="listing-tagline" value={tagline} maxLength={TAGLINE_MAX} onChange={(e) => setTagline(e.target.value)} />
        <p className="text-xs text-muted-foreground">{tagline.length}/{TAGLINE_MAX}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="listing-description">Description</Label>
        <Textarea
          id="listing-description"
          rows={4}
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{description.length}/{DESCRIPTION_MAX}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="listing-year">Established year</Label>
          <Input id="listing-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} aria-invalid={yearInvalid} />
          {yearInvalid && <p className="text-xs text-destructive">Enter a year between 1900 and {thisYear}.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="listing-area">Floor area (sq ft)</Label>
          <Input id="listing-area" inputMode="numeric" value={area} onChange={(e) => setArea(e.target.value)} aria-invalid={areaInvalid} />
          {areaInvalid && <p className="text-xs text-destructive">Enter a whole number above zero.</p>}
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        valid={!nameInvalid && !yearInvalid && !areaInvalid}
        saving={saving}
        error={error}
        approval={approval}
        onSave={onSave}
        onCancel={onClose}
      />
    </div>
  )
}
