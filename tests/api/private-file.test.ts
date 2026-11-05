import { describe, it, expect } from 'vitest'
import apiClient from '@/lib/api/client'
import { toClientPath, fetchPrivateFile } from '@/lib/api/private-file'

/**
 * NEW-222 / P9c A: private files are fetched with the signed-in client. The API names them with
 * `/api/v1/...`; the request must reach `<API>/api/v1/...` once, not `<API>/api/v1/api/v1/...`.
 * Uses the real client with a capturing adapter, so the URL is the one axios really builds.
 */
describe('private files (KYC documents, payment proofs)', () => {
  it('drops the /api/v1 the API puts in front, and only that', () => {
    expect(toClientPath('/api/v1/payments/p-1/proof')).toBe('/payments/p-1/proof')
    expect(toClientPath('/api/v1/tenants/t-1/kyc-documents/d/stream')).toBe('/tenants/t-1/kyc-documents/d/stream')
    expect(toClientPath('/payments/p-1/proof')).toBe('/payments/p-1/proof')
    expect(toClientPath('/api/v10/x')).toBe('/api/v10/x')
  })

  it('requests the route once under the base URL, as a blob, with the token', async () => {
    localStorage.setItem('gymsera_access_token', 'tok-123')
    let seen: { url: string; responseType?: string; auth?: string } | null = null
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    const original = apiClient.defaults.adapter
    apiClient.defaults.adapter = async (config) => {
      seen = { url: apiClient.getUri(config), responseType: config.responseType, auth: String(config.headers.Authorization) }
      return { data: blob, status: 200, statusText: 'OK', headers: {}, config }
    }
    try {
      const out = await fetchPrivateFile('/api/v1/payments/p-1/proof')
      expect(out).toBe(blob)
    } finally {
      apiClient.defaults.adapter = original
      localStorage.removeItem('gymsera_access_token')
    }
    expect(seen!.url).toMatch(/\/api\/v1\/payments\/p-1\/proof$/)
    expect(seen!.url).not.toContain('/api/v1/api/v1')
    expect(seen!.responseType).toBe('blob')
    expect(seen!.auth).toBe('Bearer tok-123')
  })
})

describe('NEW-222: the admin KYC viewer', () => {
  it('requests /api/v1/tenants/... once (it used to request /api/v1/api/v1/... → 404)', async () => {
    const { adminApi } = await import('@/lib/api/admin')
    let url = ''
    const original = apiClient.defaults.adapter
    apiClient.defaults.adapter = async (config) => {
      url = apiClient.getUri(config)
      return { data: new Blob(['%PDF']), status: 200, statusText: 'OK', headers: {}, config }
    }
    try {
      await adminApi.downloadKycDocumentBlob('/api/v1/tenants/t-1/kyc-documents/doc_1/stream')
    } finally {
      apiClient.defaults.adapter = original
    }
    expect(url).toMatch(/\/api\/v1\/tenants\/t-1\/kyc-documents\/doc_1\/stream$/)
    expect(url).not.toContain('/api/v1/api/v1')
  })
})
