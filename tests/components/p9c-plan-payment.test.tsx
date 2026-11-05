import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BillingPage from '@/app/(dashboard)/settings/billing/page'
import AdminPlanPaymentsPage from '@/app/(dashboard)/admin/plan-payments/page'
import { PLAN_PAYMENT_COPY } from '@/components/features/host-plan-payment'
import { hostBillingApi, planPaymentsApi } from '@/lib/api/host-billing'
import { adminPlanPaymentsApi } from '@/lib/api/admin-plan-payments'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { PLAN_PAYMENT_OVERVIEW } from '../fixtures/plan-payments'

/**
 * Phase 7 P9c item D (R-95): the host pays for a GymsEra plan by bank transfer on Subscription &
 * Billing (it used to say "a plan cannot be requested from this page … email the proof"), and a
 * platform admin approves or rejects on Plan payments. The CMS sends only plan + cycle + receipt;
 * every amount and period it shows comes from the API.
 */
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: any) => <a href={href} {...r}>{children}</a> }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

const BANK = { bankName: 'Test Bank', accountTitle: 'GymsEra Test', accountNumber: '000111', iban: null, swiftCode: null, currency: 'PKR', instructions: null }
const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
const receipt = (size = 2000, type = 'image/jpeg') => {
  const f = new File(['x'], 'receipt.jpg', { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const mountBilling = (overview: Record<string, unknown> = {}, sub: unknown = null) => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { id: 't1', status: 'ACTIVE' } }) as never)
  if (sub) vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockResolvedValue(ok(sub) as never)
  else vi.spyOn(hostBillingApi, 'getCurrentSubscription').mockRejectedValue({ response: { status: 404, data: {} } })
  vi.spyOn(hostBillingApi, 'getBranchQuota').mockResolvedValue(ok({ maxBranches: 1, activeBranches: 3, usedBranches: 3, buildableBranches: 0, remainingBranches: 0 }) as never)
  vi.spyOn(hostBillingApi, 'getCatalog').mockResolvedValue(ok({ plans: [] }) as never)
  vi.spyOn(hostBillingApi, 'getBankInstructions').mockResolvedValue(ok(BANK) as never)
  vi.spyOn(planPaymentsApi, 'getOverview').mockResolvedValue(ok({ ...PLAN_PAYMENT_OVERVIEW, ...overview }) as never)
  return wrap(<BillingPage />)
}

afterEach(() => vi.restoreAllMocks())

describe('host: pay for a plan by bank transfer', () => {
  beforeEach(() => {
    vi.spyOn(planPaymentsApi, 'submit').mockResolvedValue(ok({ request: { id: 'r1' } }) as never)
  })

  it('the page offers the flow, not "email the proof"', async () => {
    mountBilling()
    expect(await screen.findByText('Choose a plan and pay')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/cannot be requested from this page/i)
    expect(document.body.textContent).not.toMatch(/email your transaction proof/i)
    expect(await screen.findByText('000111')).toBeInTheDocument() // R-86 account, from the API
  })

  it('annual: the server\'s annual price and "One year"; submit sends plan + cycle + receipt only', async () => {
    mountBilling()
    fireEvent.click(await screen.findByLabelText(/3 branches/i))
    fireEvent.click(screen.getByLabelText(/Annual/))
    expect(screen.getByTestId('plan-payment-amount')).toHaveTextContent('49,900')
    expect(screen.getByText(/One year of the plan once approved/)).toBeInTheDocument()

    const file = receipt()
    fireEvent.change(screen.getByTestId('plan-receipt-input'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }))
    await waitFor(() => expect(planPaymentsApi.submit).toHaveBeenCalledWith({ billingPlanId: 'bp-3', billingCycle: 'YEARLY', proof: file, payerReference: undefined }))
  })

  it('monthly: the server\'s monthly price and "One month"', async () => {
    mountBilling()
    fireEvent.click(await screen.findByLabelText(/1 branch\b/i))
    fireEvent.click(screen.getByLabelText(/Monthly/))
    expect(screen.getByTestId('plan-payment-amount')).toHaveTextContent('2,000')
    expect(screen.getByText(/One month of the plan once approved/)).toBeInTheDocument()
  })

  it('the receipt is required (the app\'s wording) and limited to JPEG / PNG / WebP, 10 MB', async () => {
    mountBilling()
    fireEvent.click(await screen.findByLabelText(/1 branch\b/i))
    fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }))
    expect(await screen.findByText(PLAN_PAYMENT_COPY.receiptRequired)).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('plan-receipt-input'), { target: { files: [receipt(100, 'application/pdf')] } })
    expect(await screen.findByText(PLAN_PAYMENT_COPY.receiptType)).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('plan-receipt-input'), { target: { files: [receipt(10 * 1024 * 1024 + 1)] } })
    expect(await screen.findByText(PLAN_PAYMENT_COPY.receiptSize)).toBeInTheDocument()
    expect(planPaymentsApi.submit).not.toHaveBeenCalled()
  })

  it('pending: the status, no second form', async () => {
    mountBilling({ canSubmit: false, pending: { id: 'r1', status: 'PENDING', branchCount: 3, billingCycle: 'YEARLY', amount: '49900.00', currency: 'PKR', createdAt: '2026-11-05T10:00:00Z' } })
    expect(await screen.findByTestId('plan-payment-pending')).toHaveTextContent(PLAN_PAYMENT_COPY.pendingTitle)
    expect(screen.queryByRole('button', { name: 'Submit payment' })).toBeNull()
  })

  it('rejected: the admin\'s reason, and the form is back', async () => {
    mountBilling({ requests: [{ id: 'r0', status: 'REJECTED', branchCount: 1, billingCycle: 'MONTHLY', amount: '2000.00', currency: 'PKR', createdAt: '2026-11-01T10:00:00Z', rejectionReason: 'Amount not received' }] })
    expect(await screen.findByTestId('plan-payment-rejected')).toHaveTextContent('Amount not received')
    expect(screen.getByRole('button', { name: 'Submit payment' })).toBeInTheDocument()
  })

  it('approved: the plan and until when', async () => {
    mountBilling({ requests: [{ id: 'r0', status: 'APPROVED', branchCount: 1, billingCycle: 'MONTHLY', amount: '2000.00', currency: 'PKR', createdAt: '2026-11-01T10:00:00Z', periodEnd: '2026-12-01' }] })
    expect(await screen.findByTestId('plan-payment-approved')).toHaveTextContent(/until Dec 01, 2026/)
  })

  it.each([['IOS', 'Apple'], ['ANDROID', 'Google Play']])('a renewing %s plan: the API\'s refusal is shown, no form', async (platform, name) => {
    mountBilling({ canSubmit: false, blocked: { code: 'store_plan_active', platform, manageUrl: 'https://store.example', message: `Your plan is billed by ${name} and renews automatically.` } })
    expect(await screen.findByTestId('plan-payment-blocked')).toHaveTextContent(`billed by ${name}`)
    expect(screen.queryByRole('button', { name: 'Submit payment' })).toBeNull()
    expect(screen.getByRole('link', { name: /Manage the store subscription/ })).toHaveAttribute('href', 'https://store.example')
  })

  it('a legacy package plan is named by its package, not "Subscription"', async () => {
    mountBilling({}, { id: 's1', status: 'ACTIVE', platform: 'MANUAL', branchCount: null, package: { name: 'Starter', maxBranches: 1 }, amount: 4999, currency: 'PKR', billingCycle: 'MONTHLY', endDate: '2026-12-01', autoRenew: true, entitled: true, lapse: null })
    expect(await screen.findByText('Starter (legacy package)')).toBeInTheDocument()
    expect(screen.queryByText(/^Subscription$/)).toBeNull()
  })
})

describe('admin: Plan payments', () => {
  const row = { id: 'r1', tenantId: 't-1', tenantName: 'Iron Gym', status: 'PENDING', branchCount: 3, billingCycle: 'YEARLY', amount: '49900.00', currency: 'PKR', hasProof: true, payerReference: 'TRX-1', createdAt: '2026-11-05T10:00:00Z' }

  it('lists pending payments; approve asks first, then calls the API', async () => {
    vi.spyOn(adminPlanPaymentsApi, 'list').mockResolvedValue(ok({ requests: [row] }) as never)
    const approve = vi.spyOn(adminPlanPaymentsApi, 'approve').mockResolvedValue(ok({ request: { ...row, status: 'APPROVED' } }) as never)
    wrap(<AdminPlanPaymentsPage />)
    expect(await screen.findByText('Iron Gym')).toBeInTheDocument()
    expect(screen.getByText('TRX-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View receipt' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('dialog')
    expect(approve).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and activate' }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith('r1'))
  })

  it('reject needs a reason, which is sent', async () => {
    vi.spyOn(adminPlanPaymentsApi, 'list').mockResolvedValue(ok({ requests: [row] }) as never)
    const reject = vi.spyOn(adminPlanPaymentsApi, 'reject').mockResolvedValue(ok({ request: { ...row, status: 'REJECTED' } }) as never)
    wrap(<AdminPlanPaymentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    const send = within(dialog).getByRole('button', { name: 'Reject' })
    expect(send).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Amount not received' } })
    fireEvent.click(send)
    await waitFor(() => expect(reject).toHaveBeenCalledWith('r1', 'Amount not received'))
  })

  it('the API refusing an approval (store plan renewing) is shown in the dialog', async () => {
    vi.spyOn(adminPlanPaymentsApi, 'list').mockResolvedValue(ok({ requests: [row] }) as never)
    vi.spyOn(adminPlanPaymentsApi, 'approve').mockRejectedValue({ response: { status: 409, data: { code: 'store_plan_active', message: 'Your plan is billed by Apple and renews automatically.' } } })
    wrap(<AdminPlanPaymentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and activate' }))
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
  })
})
