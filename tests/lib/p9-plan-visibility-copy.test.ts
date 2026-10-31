// Phase 7 P9: the plan-visibility codes (P4 BUG-05, P8 NEW-146 / NEW-147) resolve to plain copy in the
// CMS. visible_plan_required answers Add Branch, New Organization and the host's submit, so it names
// the "Show to Travellers" switch rather than "before you submit".
import { describe, expect, it } from 'vitest'
import { resolveApiError } from '@/lib/api/error-copy'

const failure = (code: string) => ({ response: { status: 422, data: { success: false, code, message: 'raw server text' } } })

describe('P9 plan visibility copy', () => {
  it('visible_plan_required', () => {
    const r = resolveApiError(failure('visible_plan_required'))
    expect(r.message).toBe('Turn on "Show to Travellers" for at least one plan, then try again.')
    expect(r.message).not.toMatch(/submit/i)
    expect(resolveApiError(failure('visible_plan_required'), 'ur').message).not.toBe(r.message)
  })

  it('last_visible_plan (the API copy)', () => {
    expect(resolveApiError(failure('last_visible_plan')).message).toBe(
      'Travellers must always see at least one plan at each branch. Show another plan first, then hide this one.'
    )
  })
})
