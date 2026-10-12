import { Skeleton } from '@/components/ui/skeleton'

interface SkeletonListProps {
  rows?: number
  /** Accessible name of what is loading, e.g. "members". */
  label?: string
}

/** Loading placeholder shaped like a list of rows (spec §2.5 "Initial loading"). */
export function SkeletonList({ rows = 5, label = 'content' }: SkeletonListProps) {
  return (
    <div role="status" aria-busy="true" aria-label={`Loading ${label}`} data-testid="skeleton-list" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}
