import { BadgeCheck } from 'lucide-react'

/** The only wording of the badge's explanation (enterprise D11). */
export const VERIFIED_EXPLANATION = 'Registration document checked by GymsEra'
/** What a host sees while the business has no badge (D11). */
export const GET_VERIFIED_PROMPT = 'Upload your registration to get Verified'

/**
 * D11: a small check beside the business name when `businessVerified`. It says only that the
 * registration document was checked; it never affects visibility.
 */
export function VerifiedCheck({ verified, withLabel = false }: { verified?: boolean | null; withLabel?: boolean }) {
  if (!verified) return null
  return (
    <span
      data-testid="verified-check"
      title={VERIFIED_EXPLANATION}
      aria-label={`Verified: ${VERIFIED_EXPLANATION}`}
      className="inline-flex items-center gap-1 text-primary"
    >
      <BadgeCheck className="h-4 w-4" aria-hidden="true" />
      {withLabel && <span className="text-xs font-medium">Verified</span>}
    </span>
  )
}
