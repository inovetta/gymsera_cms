/**
 * The branch form rules the CMS shares with the app (enterprise spec D8, §3.1, §4): one place for
 * Add Branch (Businesses page, Branches page) and the held first branch of Add Business.
 * The server decides (it refuses what breaks a rule); these only say what is missing first.
 */
import type { Business } from '@/lib/api/host'
import { areaPayload, locationValid, type BranchLocationValue } from '@/components/features/places/branch-location-fields'

/** Photos a branch needs (cover + gallery, D8). */
export const MIN_BRANCH_PHOTOS = 3

/** Opening hours every new branch starts with (D8). */
export const DEFAULT_OPENING_TIME = '06:00'
export const DEFAULT_CLOSING_TIME = '22:00'

/** Only an approved business may receive branches (D7, contract v2 `canReceiveBranches`). */
export const canReceiveBranches = (b: Pick<Business, 'canReceiveBranches'>): boolean => b.canReceiveBranches === true

/** The chip a host sees on a business card (enterprise §3.4: Live / Under review / Needs documents / Rejected). */
export type BusinessChip = { label: 'Live' | 'Under review' | 'Needs documents' | 'Rejected' | 'Deleted'; tone: 'ok' | 'info' | 'warning' | 'danger' }

export function businessChip(b: Pick<Business, 'status' | 'missingForApproval'>): BusinessChip {
  const status = (b.status ?? '').toUpperCase()
  if (status === 'ACTIVE') return { label: 'Live', tone: 'ok' }
  if (status === 'REJECTED') return { label: 'Rejected', tone: 'danger' }
  if (status === 'INACTIVE') return { label: 'Deleted', tone: 'danger' }
  if ((b.missingForApproval ?? []).length > 0) return { label: 'Needs documents', tone: 'warning' }
  return { label: 'Under review', tone: 'info' }
}

/** What an approval still needs, in words (contract v2 §5 `missingForApproval`). */
export const MISSING_LABEL: Record<string, string> = {
  PROOF_OF_PREMISES: 'Proof of premises',
  PHOTOS_MIN_3: 'At least 3 photos',
}

export interface BranchDraftCheck {
  businessId?: string | null
  branchName: string
  location: BranchLocationValue
  photos: string[]
  planName?: string
  planPrice?: number
}

/**
 * What a new branch is still missing, as short sentences (empty = ready to send).
 * `requireBusiness` is false for the held first branch of Add Business (the business does not exist yet).
 */
export function branchDraftMissing(d: BranchDraftCheck, requireBusiness = true): string[] {
  const missing: string[] = []
  if (requireBusiness && !d.businessId) missing.push('Choose the business')
  if (!d.branchName.trim()) missing.push('Branch name')
  if (!d.location.cityId) missing.push('City')
  if (!d.location.address.trim()) missing.push('Address')
  if (!('areaId' in areaPayload(d.location)) && !('areaRequestId' in areaPayload(d.location))) missing.push('Area')
  if (!locationValid(d.location)) missing.push('A valid map location')
  if (d.photos.length < MIN_BRANCH_PHOTOS) missing.push(`At least ${MIN_BRANCH_PHOTOS} photos`)
  if (d.planName !== undefined && (!d.planName.trim() || !d.planPrice || d.planPrice <= 0)) missing.push('First plan name and price')
  return missing
}

/** Why Add Business is off (G5: `canAddBusiness`, `blockingBusinessStatus`). */
export const addBusinessBlockedMessage = (blocking: string | null | undefined): string => {
  const s = (blocking ?? '').toUpperCase()
  if (s === 'DRAFT') return 'Finish and submit your current business before adding another.'
  if (s) return 'Your current business must be approved before you can add another.'
  return 'Your plan has no free branch for a new business.'
}

