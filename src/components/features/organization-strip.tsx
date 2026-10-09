'use client'

import { cn } from '@/lib/utils'

interface OrganizationStripProps {
  listings: Array<{ id: string; title?: string; name?: string }>
  selectedId?: string
  onSelect: (id: string) => void
}

/**
 * The strip of organizations above the branches, as on the mobile Gyms tab
 * (`_buildSubTabBar` in host_gyms_overview_screen.dart). An organization here is a gym
 * listing inside the owner's account; the selected one decides which branches are listed and
 * which organization a new branch is added to (`gymListingId`).
 */
export function OrganizationStrip({ listings, selectedId, onSelect }: OrganizationStripProps) {
  if (listings.length === 0) return null
  return (
    <div role="tablist" aria-label="Organizations" className="mb-6 flex gap-6 overflow-x-auto border-b">
      {listings.map((org) => {
        const selected = org.id === selectedId
        return (
          <button
            key={org.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(org.id)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 py-3 text-sm',
              selected ? 'border-primary font-bold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {org.title || org.name}
          </button>
        )
      })}
    </div>
  )
}
