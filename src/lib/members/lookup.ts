import { hostApi, BranchMemberLookup } from '@/lib/api/host'

/**
 * The one member lookup the CMS uses (GET /host/branches/:branchId/members/lookup?email=).
 * Manual Check-in (NEW-55/56) and Record Payment (NEW-57) both go through it, so "no such member"
 * means the same thing on both screens: nobody with that email holds a subscription at the branch.
 */
export type MemberLookupResult =
  | { kind: 'found'; userId: string; fullName: string; email: string; lookup: BranchMemberLookup }
  | { kind: 'not_found'; email: string; message: string }

export const normaliseEmail = (email: string) => email.trim().toLowerCase()

export const memberNotFoundMessage = (email: string) =>
  `No member with the email ${email} was found at this branch.`

export async function lookupBranchMemberByEmail(branchId: string, email: string): Promise<MemberLookupResult> {
  const cleanEmail = normaliseEmail(email)
  const lookup = (await hostApi.lookupBranchMember(branchId, cleanEmail)).data
  if (!lookup?.exists || !lookup.user) {
    return { kind: 'not_found', email: cleanEmail, message: memberNotFoundMessage(cleanEmail) }
  }
  return {
    kind: 'found',
    userId: lookup.user.id,
    fullName: lookup.user.fullName || cleanEmail,
    email: cleanEmail,
    lookup,
  }
}
