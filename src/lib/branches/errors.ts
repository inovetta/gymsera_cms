import { resolveApiError } from '@/lib/api/error-copy'

export type BranchBlock =
  /** 403 branch_limit_reached: the plan is fully used. */
  | { kind: 'limit'; message: string }
  /** 403 account_over_quota: the account is over its quota. */
  | { kind: 'over_quota'; message: string }
  | { kind: 'other'; message: string; code: string | null; status: number | null }

/**
 * Sorts a failed branch call. Only the two "no room" refusals lead to the upsell (mobile
 * `_mapBranchCapacityBlock`); a billing lock, a validation error or anything else is shown
 * as the reason, with the shared error-copy text where the code is in the table (CAP-01).
 */
export const classifyBranchError = (error: unknown): BranchBlock => {
  const resolved = resolveApiError(error)
  const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response
  const status = response?.status ?? null
  const serverMessage = response?.data?.message

  if (status === 403 && resolved.code === 'branch_limit_reached') {
    return { kind: 'limit', message: serverMessage || 'Your plan has no room for another branch.' }
  }
  if (status === 403 && resolved.code === 'account_over_quota') {
    return { kind: 'over_quota', message: serverMessage || 'Your plan has no room for another branch.' }
  }
  // Prefer the server's own sentence over the generic copy of a generic code.
  const generic = new Set(['forbidden', 'conflict', 'not_found', 'validation_error'])
  const message =
    resolved.code && generic.has(resolved.code) && serverMessage ? serverMessage : resolved.message
  return { kind: 'other', message, code: resolved.code, status }
}
