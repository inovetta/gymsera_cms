import type { BranchPublicContent } from '@/lib/api/host'
import type { ListingAccess } from '@/lib/listing/access'

/** What every section editor receives from the hub. */
export interface SectionEditorProps {
  branchId: string
  branch: BranchPublicContent
  access: ListingAccess
  onClose: () => void
}
