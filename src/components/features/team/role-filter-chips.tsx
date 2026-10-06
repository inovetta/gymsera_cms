'use client'

import { TeamMember } from '@/lib/api/team'
import { cn } from '@/lib/utils'

interface RoleFilterChipsProps {
  team: TeamMember[]
  /** Selected role key; null means All. */
  selected: string | null
  onSelect: (roleKey: string | null) => void
}

/**
 * Role chips with a live count each, most senior first. A role nobody holds gets
 * no chip (mobile `_RoleFilterBar`).
 */
export function RoleFilterChips({ team, selected, onSelect }: RoleFilterChipsProps) {
  const roles = new Map<string, { name: string; level: number; count: number }>()
  for (const m of team) {
    const entry = roles.get(m.role.key)
    if (entry) entry.count += 1
    else roles.set(m.role.key, { name: m.role.name, level: m.role.level, count: 1 })
  }
  const ordered = Array.from(roles.entries()).sort((a, b) => b[1].level - a[1].level)

  return (
    <div role="group" aria-label="Filter by role" className="flex flex-wrap gap-2">
      <Chip label="All" count={team.length} selected={selected === null} onClick={() => onSelect(null)} />
      {ordered.map(([key, r]) => (
        <Chip
          key={key}
          label={r.name}
          count={r.count}
          selected={selected === key}
          // Clicking the selected chip clears the filter.
          onClick={() => onSelect(selected === key ? null : key)}
        />
      ))}
    </div>
  )
}

function Chip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string
  count: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
      )}
    >
      {label} <span className={cn('ml-1', selected ? 'opacity-90' : 'text-muted-foreground')}>{count}</span>
    </button>
  )
}
