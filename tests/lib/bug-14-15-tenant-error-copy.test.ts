// BUG-14 / BUG-15: the API's developer sentence for a missing gym context ("... send an X-Tenant-Id
// header") must never reach a screen. Both tenant codes resolve to plain copy from the shared catalog.
import { describe, expect, it } from 'vitest'
import { resolveApiError } from '@/lib/api/error-copy'

const RAW =
  'This route requires a gym context. Sign in as a gym host or team member, or send an X-Tenant-Id header.'
const failure = (status: number, code: string, message: string) => ({
  response: { status, data: { success: false, error: { code, message, requestId: 'req_cms' } } },
})

describe('BUG-14/15: tenant errors show plain copy', () => {
  it('missing_tenant_context with the old developer sentence', () => {
    const r = resolveApiError(failure(400, 'missing_tenant_context', RAW))
    expect(r.message).toBe('Choose a gym to continue.')
    expect(r.message).not.toContain('X-Tenant-Id')
    expect(r.requestId).toBe('req_cms')
  })

  it('tenant_not_active', () => {
    expect(resolveApiError(failure(409, 'tenant_not_active', 'x')).message).toBe(
      'Your gym is not live yet. Finish setting it up to use this.'
    )
  })
})

describe('BUG-15: Team & Access keeps the copy, not the server sentence', () => {
  it('teamErrorMessage for missing_tenant_context', async () => {
    const { teamErrorMessage } = await import('@/lib/team/access')
    const r = teamErrorMessage(failure(400, 'missing_tenant_context', RAW))
    expect(r.message).toBe('Choose a gym to continue.')
    expect(r.status).toBe(400)
  })
})
