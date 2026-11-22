/**
 * Enterprise §5 / D10 / D11, contract v2 A1 G1, G3, G4 and A2 H3 (R-120): the admin approves each
 * business on its own, with its documents and the Verified badge. One business id, no compound ids (F7).
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BusinessReviewPanel, missingFromError } from '@/components/features/admin-organization/business-review-panel'
import ReviewQueuePage from '@/app/(dashboard)/admin/review-queue/page'
import { reviewQueueHref } from '@/lib/admin/review-queue'
import { adminApi } from '@/lib/api/admin'
import { apiError, ok } from '../fixtures/team'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

const business = (over: Record<string, unknown> = {}) => ({
  id: 'biz-2', organizationId: 'org-1', name: 'Peak Fitness', status: 'PENDING', kycStatus: 'PENDING',
  businessVerified: false, heldFirstBranch: true, missingForApproval: [], ...over,
})
const PREMISES = { id: 'd1', type: 'PROOF_OF_PREMISES', status: 'PENDING', uploadedAt: '2026-11-20T10:00:00Z', reviewedAt: null, rejectionReason: null }
const REGISTRATION = { id: 'd2', type: 'BUSINESS_REGISTRATION', status: 'APPROVED', uploadedAt: '2026-11-20T10:05:00Z', reviewedAt: '2026-11-21T09:00:00Z', rejectionReason: null }

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>)

const spies = (biz = business(), docs: unknown[] = [PREMISES, REGISTRATION]) => {
  vi.spyOn(adminApi, 'getBusiness').mockResolvedValue(ok({ business: biz }) as never)
  vi.spyOn(adminApi, 'getBusinessDocuments').mockResolvedValue(docs as never)
}

beforeEach(() => { toast.mockReset(); push.mockReset() })
afterEach(() => vi.restoreAllMocks())

describe('Admin business review panel', () => {
  it('lists the documents with type, date and status; no file name is shown', async () => {
    spies()
    wrap(<BusinessReviewPanel businessId="biz-2" organizationId="org-1" />)
    const premises = await screen.findByTestId('business-doc-d1')
    expect(premises).toHaveTextContent('Proof of premises')
    expect(premises).toHaveTextContent('Pending')
    expect(screen.getByTestId('business-doc-d2')).toHaveTextContent('Registration')
  })

  it('approves with an Idempotency-Key on the business id; a 422 names what is still missing', async () => {
    spies()
    const approve = vi.spyOn(adminApi, 'approveBusiness').mockRejectedValueOnce(
      Object.assign(apiError(422, 'missing', 'business_requirements_missing'), { response: { status: 422, data: { code: 'business_requirements_missing', message: 'missing', data: { missing: ['PROOF_OF_PREMISES', 'PHOTOS_MIN_3'] } } } })
    ).mockResolvedValueOnce(ok({}) as never)
    wrap(<BusinessReviewPanel businessId="biz-2" organizationId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: /approve business/i }))
    expect(await screen.findByTestId('review-problem')).toHaveTextContent('Still needed: Proof of premises, At least 3 photos.')
    expect(approve.mock.calls[0][0]).toBe('biz-2')
    expect(typeof approve.mock.calls[0][1]).toBe('string')
    fireEvent.click(screen.getByRole('button', { name: /approve business/i }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Business approved' })))
  })

  it('rejects the business with a reason', async () => {
    spies()
    const reject = vi.spyOn(adminApi, 'rejectBusiness').mockResolvedValue(ok({}) as never)
    wrap(<BusinessReviewPanel businessId="biz-2" organizationId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: /reject business/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Photos are not of the gym' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(reject).toHaveBeenCalledWith('biz-2', 'Photos are not of the gym'))
  })

  it('approves and rejects one document through the document routes', async () => {
    spies()
    const approveDoc = vi.spyOn(adminApi, 'approveBusinessDocument').mockResolvedValue(ok({ document: {} }) as never)
    const rejectDoc = vi.spyOn(adminApi, 'rejectBusinessDocument').mockResolvedValue(ok({ document: {} }) as never)
    wrap(<BusinessReviewPanel businessId="biz-2" organizationId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Proof of premises' }))
    await waitFor(() => expect(approveDoc).toHaveBeenCalledWith('biz-2', 'd1'))
    fireEvent.click(screen.getByRole('button', { name: 'Reject Proof of premises' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Unreadable' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(rejectDoc).toHaveBeenCalledWith('biz-2', 'd1', 'Unreadable'))
  })

  it('views a document through the stream route of that business', async () => {
    spies()
    const download = vi.spyOn(adminApi, 'downloadBusinessDocument').mockResolvedValue(new Blob(['%PDF']))
    ;(URL as any).createObjectURL = vi.fn(() => 'blob:x')
    vi.spyOn(window, 'open').mockReturnValue(null)
    wrap(<BusinessReviewPanel businessId="biz-2" organizationId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'View Proof of premises' }))
    await waitFor(() => expect(download).toHaveBeenCalledWith('biz-2', 'd1'))
  })

  it('Verify needs a registration document; with one it calls POST …/verify', async () => {
    spies(business(), [PREMISES])
    wrap(<BusinessReviewPanel businessId="biz-2" organizationId="org-1" />)
    expect(await screen.findByRole('button', { name: /verify/i })).toBeDisabled()
  })

  it('verifies, and removes the verification again (D11)', async () => {
    spies(business(), [PREMISES, REGISTRATION])
    const verify = vi.spyOn(adminApi, 'verifyBusiness').mockResolvedValue(ok({}) as never)
    wrap(<BusinessReviewPanel businessId="biz-2" organizationId="org-1" />)
    fireEvent.click(await screen.findByRole('button', { name: /verify/i }))
    await waitFor(() => expect(verify).toHaveBeenCalledWith('biz-2'))
  })

  it('a verified business shows the check and "Remove verification"', async () => {
    spies(business({ businessVerified: true, verifiedAt: '2026-11-21T09:00:00Z', status: 'ACTIVE' }))
    const unverify = vi.spyOn(adminApi, 'unverifyBusiness').mockResolvedValue(ok({}) as never)
    wrap(<BusinessReviewPanel businessId="biz-2" organizationId="org-1" />)
    expect(await screen.findByTestId('verified-check')).toBeInTheDocument()
    expect(screen.getByText(/Registration document checked by GymsEra/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve business/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /remove verification/i }))
    await waitFor(() => expect(unverify).toHaveBeenCalledWith('biz-2'))
  })

  it('missingFromError reads data.missing, nothing else', () => {
    expect(missingFromError({ response: { data: { data: { missing: ['PHOTOS_MIN_3'] } } } })).toEqual(['At least 3 photos'])
    expect(missingFromError(new Error('x'))).toEqual([])
  })
})

describe('Review queue (G1)', () => {
  const ITEMS = [
    { kind: 'ORGANIZATION', organizationId: 'org-1', name: 'Khan Fitness Ltd', status: 'PENDING_REVIEW', kycStatus: 'PENDING', submittedAt: '2026-11-20T10:00:00Z' },
    { kind: 'BUSINESS', organizationId: 'org-1', businessId: 'biz-2', name: 'Peak Fitness', status: 'PENDING', kycStatus: 'PENDING', submittedAt: '2026-11-21T10:00:00Z' },
  ]

  it('lists organizations and businesses; a business row opens its organization on that business', async () => {
    const queue = vi.spyOn(adminApi, 'getReviewQueue').mockResolvedValue(ok({ items: ITEMS, page: 1, total: 2 }) as never)
    wrap(<ReviewQueuePage />)
    expect(await screen.findByText('Khan Fitness Ltd')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Peak Fitness'))
    expect(push).toHaveBeenCalledWith('/admin/organizations/org-1?business=biz-2')
    fireEvent.click(screen.getByText('Khan Fitness Ltd'))
    expect(push).toHaveBeenLastCalledWith('/admin/organizations/org-1')
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
  })

  it('the Businesses tab asks only for BUSINESS items', async () => {
    const queue = vi.spyOn(adminApi, 'getReviewQueue').mockResolvedValue(ok({ items: [], page: 1, total: 0 }) as never)
    wrap(<ReviewQueuePage />)
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Businesses' }), { button: 0 })
    await waitFor(() => expect(queue).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'BUSINESS' })))
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument()
  })

  it('reviewQueueHref never builds a compound id', () => {
    expect(reviewQueueHref({ kind: 'BUSINESS', organizationId: 'o', businessId: 'b' })).toBe('/admin/organizations/o?business=b')
    expect(reviewQueueHref({ kind: 'ORGANIZATION', organizationId: 'o' })).toBe('/admin/organizations/o')
  })
})
