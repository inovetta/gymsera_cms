import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adminApi } from '@/lib/api/admin'
import apiClient from '@/lib/api/client'

vi.mock('@/lib/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('adminApi KYC documents (SEC-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches KYC documents for a tenant', async () => {
    const mockDocs = [
      {
        documentId: 'doc_1',
        originalName: 'license.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        streamUrl: '/api/v1/tenants/t-1/kyc-documents/doc_1/stream',
      },
    ]

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockDocs },
    } as any)

    const res = await adminApi.getTenantKycDocuments('t-1')

    expect(apiClient.get).toHaveBeenCalledWith('/tenants/t-1/kyc-documents')
    expect(res.data).toEqual(mockDocs)
  })

  it('downloads KYC document blob with responseType: blob', async () => {
    const mockBlob = new Blob(['%PDF-1.4 content'], { type: 'application/pdf' })

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockBlob,
    } as any)

    const blob = await adminApi.downloadKycDocumentBlob('/api/v1/tenants/t-1/kyc-documents/doc_1/stream')

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/v1/tenants/t-1/kyc-documents/doc_1/stream',
      { responseType: 'blob' }
    )
    expect(blob).toBe(mockBlob)
  })
})
