import { resolveApiError } from '@/lib/api/error-copy'

interface ApiErrorShape {
  response?: {
    status?: number
    data?: { message?: string; code?: string; errors?: Array<{ field?: string; message?: string }> }
  }
  code?: string
}

/** The server's own sentence for a failed call, or null when it sent none. */
export function serverMessage(error: unknown): string | null {
  const data = (error as ApiErrorShape)?.response?.data
  const fields = data?.errors?.map((e) => e.message || e.field).filter(Boolean).join(', ')
  return fields || data?.message || null
}

/** The `code` the server put on the reply (`reauth_required`, `cooling_period_active`, …). */
export function serverCode(error: unknown): string | null {
  const data = (error as ApiErrorShape)?.response?.data
  return data?.code ?? resolveApiError(error).code ?? null
}

export const httpStatus = (error: unknown): number | null => (error as ApiErrorShape)?.response?.status ?? null

/** The call needs the person's password / a fresh sign-in (SEC-13, NEW-35, NEW-38). */
export const isReauthChallenge = (error: unknown): boolean => {
  const code = serverCode(error)
  return code === 'reauth_required' || code === 'invalid_credentials'
}

const GENERIC_CODES = new Set(['forbidden', 'conflict', 'not_found', 'validation_error'])

/**
 * What to show when a call failed: the server's message when it sent one, the shared copy for
 * a known code that has no message, then the page's own specific fallback. Never a bare
 * "Failed to …"; a call that never reached the server says so.
 */
export function describeRequestError(error: unknown, fallback: string): string {
  const server = serverMessage(error)
  if (server) return server
  const err = error as ApiErrorShape
  if (!err?.response) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  const resolved = resolveApiError(error)
  if (resolved.code && !GENERIC_CODES.has(resolved.code) && resolved.message) return resolved.message
  return fallback
}
