import { ShieldOff } from 'lucide-react'
import { EmptyState } from '@/components/features/empty-state'

interface NoAccessProps {
  /** What the person tried to open, e.g. "the ledger". */
  what: string
  /** The permission that opens it, in words, so they know what to ask the owner for. */
  needs: string
}

/**
 * A page opened by URL without the permission that belongs to it. A clear state instead of a
 * blank page or a 403 toast loop: the page does not call its endpoints at all.
 */
export function NoAccess({ what, needs }: NoAccessProps) {
  return (
    <div role="alert" data-testid="no-access">
      <EmptyState
        icon={ShieldOff}
        title={`You do not have access to ${what}`}
        description={`Ask the owner of this organization to give you the "${needs}" permission, or switch to an organization where you hold it.`}
      />
    </div>
  )
}
