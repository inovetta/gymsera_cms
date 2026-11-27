'use client'

import { cn } from '@/lib/utils'

interface BusinessStripProps {
  businesses: Array<{ id: string; name: string }>
  selectedId?: string
  onSelect: (id: string) => void
}

/**
 * The strip of businesses, as on the mobile Gyms tab (`_buildSubTabBar` in
 * host_gyms_overview_screen.dart). The selected business decides what the page shows.
 */
export function BusinessStrip({ businesses, selectedId, onSelect }: BusinessStripProps) {
  if (businesses.length === 0) return null
  return (
    <div role="tablist" aria-label="Businesses" className="mb-6 flex gap-6 overflow-x-auto border-b">
      {businesses.map((business) => {
        const selected = business.id === selectedId
        return (
          <button
            key={business.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(business.id)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 py-3 text-sm',
              selected ? 'border-primary font-bold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {business.name}
          </button>
        )
      })}
    </div>
  )
}
