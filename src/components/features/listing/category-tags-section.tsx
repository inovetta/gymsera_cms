'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { asStringList, changedFields, joinCategories, LISTING_CATEGORIES, splitCategories } from '@/lib/listing/content'
import { SaveBar } from './section-card'
import { useListingSave } from './use-listing-save'
import type { SectionEditorProps } from './types'

const MAX_TAGS = 10

/** Category chips (stored comma-joined, as mobile does) and free tags (`tagsJson`). */
export function CategoryTagsSection({ branchId, branch, onClose }: SectionEditorProps) {
  const { save, saving, error, approval } = useListingSave(branchId)
  const [categories, setCategories] = useState<string[]>(splitCategories(branch.category))
  const [tags, setTags] = useState<string[]>(asStringList(branch.tagsJson))
  const [tagInput, setTagInput] = useState('')

  const toggle = (name: string) =>
    setCategories((current) => (current.includes(name) ? current.filter((c) => c !== name) : [...current, name]))

  const addTag = () => {
    const tag = tagInput.trim()
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase()) || tags.length >= MAX_TAGS) return
    setTags([...tags, tag])
    setTagInput('')
  }

  const patch = changedFields(branch, { category: joinCategories(categories), tagsJson: tags })
  const dirty = Object.keys(patch).length > 0

  const onSave = async () => {
    if (await save(patch, 'Category and tags saved')) onClose()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Category</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          {/* A category the server already holds that is not one of the chips stays selectable. */}
          {Array.from(new Set([...LISTING_CATEGORIES, ...categories])).map((name) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={categories.includes(name) ? 'default' : 'outline'}
              aria-pressed={categories.includes(name)}
              onClick={() => toggle(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="listing-tag">Tags</Label>
        <div className="flex gap-2">
          <Input
            id="listing-tag"
            value={tagInput}
            placeholder="e.g. Women only hours"
            maxLength={30}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addTag} disabled={!tagInput.trim() || tags.length >= MAX_TAGS}>
            Add tag
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="tag-list">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => setTags(tags.filter((t) => t !== tag))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>
      <SaveBar dirty={dirty} saving={saving} error={error} approval={approval} onSave={onSave} onCancel={onClose} />
    </div>
  )
}
