import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import apiClient from '@/lib/api/client'
import { useSelectedOrgStore } from '@/stores/selected-org.store'

const seen: Array<{ url?: string; tenant?: unknown }> = []

beforeEach(() => {
  seen.length = 0
  localStorage.clear()
  useSelectedOrgStore.setState({ organizationId: null })
  apiClient.defaults.adapter = async (config) => {
    seen.push({ url: config.url, tenant: config.headers?.get?.('X-Organization-Id') ?? (config.headers as any)?.['X-Organization-Id'] })
    return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config }
  }
})
afterEach(() => {
  apiClient.defaults.adapter = undefined
})

describe('the chosen organization is sent as X-Organization-Id (Prompt 3B)', () => {
  it('sends nothing until the person has chosen one (the server then picks the most senior)', async () => {
    await apiClient.get('/team')
    expect(seen[0].tenant).toBeFalsy()
  })

  it('sends the chosen organization on every request', async () => {
    useSelectedOrgStore.getState().select('tenant-b')
    await apiClient.get('/team')
    await apiClient.post('/organizations/me/members/enroll', {})
    expect(seen.map((s) => s.tenant)).toEqual(['tenant-b', 'tenant-b'])
  })

  it('never sends it on /me/context (that call is what lists the organizations) or /auth/*', async () => {
    useSelectedOrgStore.getState().select('tenant-b')
    await apiClient.get('/me/context')
    await apiClient.post('/auth/refresh', {})
    expect(seen.map((s) => s.tenant)).toEqual([undefined, undefined])
  })

  it('remembers the choice across reloads, and drops one that is no longer valid', () => {
    useSelectedOrgStore.getState().select('tenant-b')
    expect(localStorage.getItem('gymsera_selected_organization')).toBe('tenant-b')

    // "reload": the in-memory state is gone, the stored choice is still there.
    useSelectedOrgStore.setState({ organizationId: null })
    useSelectedOrgStore.getState().reconcile(['tenant-a', 'tenant-b'])
    expect(useSelectedOrgStore.getState().organizationId).toBe('tenant-b')

    // The person was removed from that gym.
    useSelectedOrgStore.setState({ organizationId: null })
    useSelectedOrgStore.getState().reconcile(['tenant-a'])
    expect(useSelectedOrgStore.getState().organizationId).toBeNull()
    expect(localStorage.getItem('gymsera_selected_organization')).toBeNull()
  })
})
