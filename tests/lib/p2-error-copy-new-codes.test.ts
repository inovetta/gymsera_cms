// Phase 7 P2: the two codes the API added (tenant_unavailable for an unreachable gym database,
// city_required when an admin approves a gym with no known city) resolve to plain copy.
import { describe, expect, it } from 'vitest'
import { resolveApiError } from '@/lib/api/error-copy'

const failure = (status: number, code: string, message: string) => ({
  response: { status, data: { success: false, error: { code, message, requestId: 'req_p2' } } },
})

describe('P2 error codes', () => {
  it('tenant_unavailable', () => {
    const r = resolveApiError(failure(503, 'tenant_unavailable', 'x'))
    expect(r.message).toBe('We could not load your gym right now. Please try again.')
    expect(r.requestId).toBe('req_p2')
  })

  it('city_required', () => {
    expect(resolveApiError(failure(422, 'city_required', 'x')).message).toBe(
      'This gym has no city yet. Set its city, then approve it.'
    )
  })
})
