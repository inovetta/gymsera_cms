/**
 * Enterprise spec §5 (G1) review queue, D10 documents, D11 verified badge: the parts the page tests do not reach.
 * Contract v2 A2 H3 (document item) and A3 (host list wrapper not named: both shapes are read).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReviewQueuePage from '@/app/(dashboard)/admin/review-queue/page'
import { BusinessDocumentsDialog } from '@/components/features/businesses/business-documents-dialog'
import { VerifiedCheck, VERIFIED_EXPLANATION } from '@/components/features/businesses/verified-check'
import { reviewQueueHref } from '@/lib/admin/review-queue'
import { adminApi } from '@/lib/api/admin'
import { hostApi, documentsFrom, type Business } from '@/lib/api/host'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

afterEach(() => { vi.restoreAllMocks(); push.mockReset() })

describe('reviewQueueHref', () => {
  it('opens a business row on its business and an organization row on the organization', () => {
    expect(reviewQueueHref({ kind: 'BUSINESS', organizationId: 'o1', businessId: 'b1' })).toBe('/admin/organizations/o1?business=b1')
    expect(reviewQueueHref({ kind: 'ORGANIZATION', organizationId: 'o1' })).toBe('/admin/organizations/o1')
    expect(reviewQueueHref({ kind: 'BUSINESS', organizationId: 'o1' })).toBe('/admin/organizations/o1')
  })
})

describe('Review queue page', () => {
  const items = [
    { kind: 'ORGANIZATION', organizationId: 'o1', name: 'Khan Fitness Ltd', status: 'PENDING', kycStatus: 'PENDING', submittedAt: '2026-11-20T10:00:00Z' },
    { kind: 'BUSINESS', organizationId: 'o2', businessId: 'b9', name: 'Peak Fitness', status: 'PENDING', kycStatus: null, submittedAt: null },
  ]

  it('lists organizations and businesses, and a row opens the right page', async () => {
    const spy = vi.spyOn(adminApi, 'getReviewQueue').mockResolvedValue({ success: true, data: { items, total: 2 } } as never)
    wrap(<ReviewQueuePage />)
    expect(await screen.findByText('Khan Fitness Ltd')).toBeInTheDocument()
    expect(screen.getByText('Peak Fitness')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Peak Fitness'))
    expect(push).toHaveBeenCalledWith('/admin/organizations/o2?business=b9')
    fireEvent.click(screen.getByText('Khan Fitness Ltd'))
    expect(push).toHaveBeenCalledWith('/admin/organizations/o1')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ kind: undefined }))
  })

  it('the Businesses tab asks the API for businesses only, from page 1', async () => {
    const spy = vi.spyOn(adminApi, 'getReviewQueue').mockResolvedValue({ success: true, data: { items: [], total: 0 } } as never)
    wrap(<ReviewQueuePage />)
    await screen.findByText('Nothing to review')
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Businesses' }), { button: 0 })
    fireEvent.click(screen.getByRole('tab', { name: 'Businesses' }))
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'BUSINESS', page: 1 })))
  })
})

describe('documentsFrom (host list wrapper is not named in the contract)', () => {
  const doc = { id: 'd1', type: 'PROOF_OF_PREMISES', status: 'PENDING', uploadedAt: '2026-11-20T10:00:00Z', reviewedAt: null, rejectionReason: null }
  it('reads a bare array and the { documents } wrapper, and nothing else', () => {
    expect(documentsFrom([doc])).toEqual([doc])
    expect(documentsFrom({ documents: [doc] })).toEqual([doc])
    expect(documentsFrom(undefined)).toEqual([])
    expect(documentsFrom({ documents: 'x' })).toEqual([])
  })
})

describe('Business documents dialog', () => {
  const business = { id: 'biz-1', name: 'Iron House', businessVerified: false } as unknown as Business

  it('shows each document under its kind with status and the rejection reason', async () => {
    vi.spyOn(hostApi, 'getBusinessDocuments').mockResolvedValue([
      { id: 'd1', type: 'PROOF_OF_PREMISES', status: 'REJECTED', uploadedAt: '2026-11-20T10:00:00Z', reviewedAt: '2026-11-21T10:00:00Z', rejectionReason: 'Address is cut off' },
      { id: 'd2', type: 'BUSINESS_REGISTRATION', status: 'APPROVED', uploadedAt: '2026-11-20T10:00:00Z', reviewedAt: null, rejectionReason: null },
    ] as never)
    wrap(<BusinessDocumentsDialog business={business} open onOpenChange={vi.fn()} />)
    await screen.findByTestId('host-doc-d1')
    const premises = screen.getByTestId('doc-kind-PROOF_OF_PREMISES')
    expect(premises).toHaveTextContent('Address is cut off')
    expect(premises).not.toHaveTextContent('Registration, added')
    expect(screen.getByTestId('doc-kind-BUSINESS_REGISTRATION')).toHaveTextContent('Registration, added')
    expect(screen.queryByTestId('verified-check')).toBeNull()
  })

  it('uploads with the key type, not documentType', async () => {
    vi.spyOn(hostApi, 'getBusinessDocuments').mockResolvedValue([])
    const upload = vi.spyOn(hostApi, 'uploadBusinessDocuments').mockResolvedValue({ success: true } as never)
    wrap(<BusinessDocumentsDialog business={business} open onOpenChange={vi.fn()} />)
    const file = new File(['x'], 'reg.pdf', { type: 'application/pdf' })
    fireEvent.change(await screen.findByLabelText('Upload Registration'), { target: { files: [file] } })
    await waitFor(() => expect(upload).toHaveBeenCalledWith('biz-1', 'BUSINESS_REGISTRATION', [file]))
  })
})

describe('VerifiedCheck (D11)', () => {
  it('renders only when verified, with the one approved wording', () => {
    const { rerender } = render(<VerifiedCheck verified={false} />)
    expect(screen.queryByTestId('verified-check')).toBeNull()
    rerender(<VerifiedCheck verified={null} />)
    expect(screen.queryByTestId('verified-check')).toBeNull()
    rerender(<VerifiedCheck verified withLabel />)
    const el = screen.getByTestId('verified-check')
    expect(el).toHaveAttribute('title', VERIFIED_EXPLANATION)
    expect(el).toHaveTextContent('Verified')
    expect(VERIFIED_EXPLANATION).not.toMatch(/trusted|safe|licensed/i)
  })
})
