import { describe, it, expect, vi, beforeEach } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ default: http }))

import { subscriptionsApi } from '@/lib/api/subscriptions'
import { refundsApi, refundOffer, refundAmountError, cancelRefundToast, RefundQuote } from '@/lib/api/refunds'
import { refundWindowError } from '@/components/features/refunds/refund-policy-dialog'

// NEW-253 (R-103): refunds on cancellation. The CMS calls the staff routes and shows what the server's
// quote allows; it never decides the policy, the amount limits or who may refund.
const quote = (over: Partial<RefundQuote> = {}): RefundQuote => ({
  subscriptionId: 's-1', refundsAllowed: true, refundWindowDays: null, eligible: true, reasonCode: null, reason: null,
  currency: 'PKR', remainingRefundable: '3000.00', suggestedAmount: '2900.00', refundTier: 'DIRECT', ...over,
})

describe('refund API routes', () => {
  beforeEach(() => {
    Object.values(http).forEach((f) => f.mockReset())
    http.get.mockResolvedValue({ data: { success: true, data: {} } })
    http.post.mockResolvedValue({ data: { success: true, data: {} } })
    http.put.mockResolvedValue({ data: { success: true, data: {} } })
  })

  it('cancel without refund sends an empty body (unchanged); with refund sends refund, amount and reason', async () => {
    await subscriptionsApi.cancelSubscription('s-1')
    expect(http.post).toHaveBeenLastCalledWith('/subscriptions/staff/s-1/cancel', {})
    await subscriptionsApi.cancelSubscription('s-1', { amount: 1200.5, reason: 'Moved city' })
    expect(http.post).toHaveBeenLastCalledWith('/subscriptions/staff/s-1/cancel', { refund: true, refundAmount: 1200.5, refundReason: 'Moved city' })
  })

  it('quote, requests, decide and policy use the staff routes', async () => {
    await refundsApi.quote('s-1')
    expect(http.get).toHaveBeenLastCalledWith('/subscriptions/staff/s-1/refund-quote')
    await refundsApi.listRequests()
    expect(http.get).toHaveBeenLastCalledWith('/subscriptions/staff/refund-requests', { params: { status: 'PENDING' } })
    await refundsApi.decide('r-1', { decision: 'APPROVE', amount: 100 })
    expect(http.post).toHaveBeenLastCalledWith('/subscriptions/staff/refund-requests/r-1/decide', { decision: 'APPROVE', amount: 100 })
    // D12 / G9: the list without a branch, one branch with branchId; a write names a branch or all branches.
    await refundsApi.getPolicies()
    expect(http.get).toHaveBeenLastCalledWith('/subscriptions/staff/refund-policy')
    await refundsApi.getPolicy('br-1')
    expect(http.get).toHaveBeenLastCalledWith('/subscriptions/staff/refund-policy', { params: { branchId: 'br-1' } })
    await refundsApi.updatePolicy({ branchId: 'br-1' }, { refundsAllowed: true, refundWindowDays: null })
    expect(http.put).toHaveBeenLastCalledWith('/subscriptions/staff/refund-policy', { branchId: 'br-1', refundsAllowed: true, refundWindowDays: null })
    await refundsApi.updatePolicy({ applyToAllBranches: true }, { refundsAllowed: false, refundWindowDays: 14 })
    expect(http.put).toHaveBeenLastCalledWith('/subscriptions/staff/refund-policy', { applyToAllBranches: true, refundsAllowed: false, refundWindowDays: 14 })
  })
})

describe('what the cancel dialog offers', () => {
  it('offers the refund with the server suggestion and maximum', () => {
    expect(refundOffer(quote())).toEqual({ suggested: 2900, max: 3000, currency: 'PKR', needsApproval: false })
    expect(refundOffer(quote({ refundTier: 'REQUEST' }))?.needsApproval).toBe(true)
  })

  it('never offers it when the policy is off, the payment is not refundable, or the caller cannot refund', () => {
    expect(refundOffer(quote({ eligible: false, refundsAllowed: false, reasonCode: 'refunds_disabled' }))).toBeNull()
    expect(refundOffer(quote({ eligible: false, reasonCode: 'refund_window_closed' }))).toBeNull()
    expect(refundOffer(quote({ refundTier: 'OFF' }))).toBeNull()
    expect(refundOffer(undefined)).toBeNull()
  })

  it('checks the typed amount: above zero, at most the balance (to the cent)', () => {
    expect(refundAmountError('', 3000)).toMatch(/greater than zero/)
    expect(refundAmountError('0', 3000)).toMatch(/greater than zero/)
    expect(refundAmountError('3000.01', 3000)).toMatch(/At most 3000.00/)
    expect(refundAmountError('3000', 3000)).toBeNull()
    expect(refundAmountError('0.01', 3000)).toBeNull()
  })

  it('the toast says whether the refund was done or waits for approval', () => {
    expect(cancelRefundToast({ status: 'EXECUTED', refund: { status: 'EXECUTED' } }).title).toBe('Subscription cancelled and payment refunded')
    expect(cancelRefundToast({ status: 'EXECUTED', refund: { status: 'PENDING' } }).description).toBe('The refund was sent for approval.')
    expect(cancelRefundToast({ status: 'PENDING' }).title).toBe('Sent for approval')
    expect(cancelRefundToast({ status: 'EXECUTED' }).title).toBe('Subscription cancelled')
  })

  it('refund window: empty = no limit, else 1 to 3650 whole days', () => {
    expect(refundWindowError('')).toBeNull()
    expect(refundWindowError('30')).toBeNull()
    expect(refundWindowError('0')).not.toBeNull()
    expect(refundWindowError('2.5')).not.toBeNull()
    expect(refundWindowError('3651')).not.toBeNull()
  })
})
