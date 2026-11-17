import { PendingArea } from '@/lib/api/area-requests'

/**
 * NEW-265 (R-109 F7): what an admin sees instead of an empty area while the gym waits on an area
 * request (CMS › Cities & Areas › Unmatched areas decides it), or after it was refused.
 */
export function PendingAreaNote({ pendingArea }: { pendingArea?: PendingArea | null }) {
  if (!pendingArea) return null
  return pendingArea.status === 'rejected' ? (
    <span data-testid="pending-area" className="text-xs text-destructive">
      Area “{pendingArea.name}” not accepted{pendingArea.rejectReason ? `: ${pendingArea.rejectReason}` : ''}
    </span>
  ) : (
    <span data-testid="pending-area" className="text-xs text-amber-700">Area “{pendingArea.name}” under review</span>
  )
}
