import { hostApi } from '@/lib/api/host'
import { subscriptionsApi } from '@/lib/api/subscriptions'
import type { MemberSubscription } from '@/types'

/**
 * Manual check-in (NEW-55). The server wants userId + subscriptionId + branchId
 * (attendance.validator.js `manual`), so the staff member types an email and the CMS finds the
 * rest at the selected branch: the member (host lookup route), then their subscriptions
 * (GET /subscriptions/staff). Capacity and validity are still decided by the server.
 */

/** A staff-list subscription trimmed to what the picker shows. */
export interface CheckInOption {
  id: string
  planName: string
  endDate: string
  remainingVisits: number | null
}

export type CheckInResolution =
  | { kind: 'ready'; userId: string; subscriptionId: string; memberName: string }
  | { kind: 'choose'; userId: string; memberName: string; options: CheckInOption[] }
  | { kind: 'no_member'; message: string }
  | { kind: 'no_subscription'; message: string }

const todayUtc = () => new Date().toISOString().slice(0, 10)

/** Mirrors the server's own checks (attendance.service.js `_validateSubscription`): not past its end date, visits left. */
const validToday = (s: MemberSubscription, today: string) =>
  s.status === 'ACTIVE' &&
  (!s.endDate || String(s.endDate).slice(0, 10) >= today) &&
  (s.remainingVisits === null || s.remainingVisits === undefined || s.remainingVisits > 0)

const toOption = (s: MemberSubscription): CheckInOption => ({
  id: s.id,
  planName: s.plan?.name ?? s.membershipPlan?.name ?? 'Membership',
  endDate: s.endDate,
  remainingVisits: s.remainingVisits ?? null,
})

export async function resolveManualCheckIn(branchId: string, email: string): Promise<CheckInResolution> {
  const cleanEmail = email.trim().toLowerCase()

  const lookup = (await hostApi.lookupBranchMember(branchId, cleanEmail)).data
  if (!lookup?.exists || !lookup.user) {
    return { kind: 'no_member', message: `No member with the email ${cleanEmail} was found at this branch.` }
  }
  const { id: userId, fullName } = lookup.user
  const memberName = fullName || cleanEmail

  const subs = (
    await subscriptionsApi.getStaffSubscriptions({ branchId, userId, status: 'ACTIVE', limit: 100 })
  ).data?.subscriptions ?? []
  const today = todayUtc()
  const valid = subs.filter((s) => s.userId === userId && s.branchId === branchId && validToday(s, today))

  if (valid.length === 0) {
    return { kind: 'no_subscription', message: `${memberName} has no active subscription at this branch.` }
  }
  if (valid.length === 1) return { kind: 'ready', userId, subscriptionId: valid[0].id, memberName }
  return { kind: 'choose', userId, memberName, options: valid.map(toOption) }
}

interface ApiErrorShape {
  response?: { status?: number; data?: { message?: string; code?: string; errors?: Array<{ field?: string; message?: string }> } }
  message?: string
}

/**
 * The sentence to show for a failed check-in call. The server's own message always wins (it says
 * "Member already checked in at 10:32", "Subscription has expired", which field failed
 * validation, ...); the fixed copy below is only for a reply that carries none.
 * `step` says which call failed, since a 403 on the member lookup is not the same refusal as on the check-in.
 */
export function describeCheckInError(error: unknown, step: 'lookup' | 'check-in' = 'check-in'): string {
  const err = error as ApiErrorShape
  const status = err?.response?.status
  const data = err?.response?.data

  const fields = data?.errors?.map((e) => e.message || e.field).filter(Boolean).join(', ')
  const server = fields || data?.message
  if (server) return server

  if (status === 403) {
    return step === 'lookup'
      ? 'You do not have permission to look up members at this branch.'
      : 'You do not have permission to check members in at this branch.'
  }
  if (status === 409) return 'This member is already checked in.'
  if (status === 404) return 'The member or subscription was not found at this branch.'
  if (status === 422) return 'The server rejected the check-in details. Check the email and branch and try again.'
  return 'Could not record the check-in. Check your connection and try again.'
}
