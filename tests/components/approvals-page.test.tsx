import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ApprovalsPage from '@/app/(dashboard)/gym/approvals/page'
import { SubmittedForApprovalNotice } from '@/components/features/approvals/submitted-for-approval-notice'
import { approvalsApi, readApprovalOutcome, ApprovalRequest } from '@/lib/api/approvals'
import apiClient from '@/lib/api/client'
import { apiError, ok } from '../fixtures/team'

let tabParam: string | null = null

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'tab' ? tabParam : null) }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid="header" />,
}))

const request = (over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'req-1',
  actionKey: 'members.create',
  actionLabel: 'Add a member',
  module: 'members',
  dangerous: false,
  summary: 'Add member Ali Raza — Monthly plan',
  status: 'PENDING',
  branch: { id: 'branch-1', name: 'Uptown' },
  requestedBy: 'user-desk',
  requestedByName: 'Sana Malik',
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  decisionReason: null,
  collectedBy: null,
  collectedAt: null,
  paymentStatus: null,
  ...over,
})

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ApprovalsPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  tabParam = null
})
afterEach(() => vi.restoreAllMocks())

describe('approvalsApi — the endpoints the mobile app calls (UX-13)', () => {
  it('lists, approves, rejects and withdraws on /approvals', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: ok([]) } as never)
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: ok({}) } as never)

    await approvalsApi.list()
    await approvalsApi.mine()
    await approvalsApi.approve('req-1')
    await approvalsApi.reject('req-1', 'Wrong plan')
    await approvalsApi.cancel('req-1')

    expect(get).toHaveBeenNthCalledWith(1, '/approvals', { params: { status: 'PENDING' } })
    expect(get).toHaveBeenNthCalledWith(2, '/approvals/mine', { params: {} })
    expect(post).toHaveBeenNthCalledWith(1, '/approvals/req-1/approve', {})
    expect(post).toHaveBeenNthCalledWith(2, '/approvals/req-1/reject', { reason: 'Wrong plan' })
    expect(post).toHaveBeenNthCalledWith(3, '/approvals/req-1/cancel')
  })
})

describe('ApprovalsPage (UX-13)', () => {
  it('shows "Waiting on you" with who asked, where and when, and approves with POST /approvals/:id/approve', async () => {
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([request()]) as never)
    vi.spyOn(approvalsApi, 'mine').mockResolvedValue(ok([]) as never)
    const approve = vi.spyOn(approvalsApi, 'approve').mockResolvedValue(ok({}) as never)
    renderPage()

    expect(await screen.findByText('Add member Ali Raza — Monthly plan')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /waiting on you/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Sana Malik')).toBeInTheDocument()
    expect(screen.getByText('Uptown')).toBeInTheDocument()
    expect(screen.getByText('5m ago')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith('req-1'))
  })

  it('needs a reason to reject, then sends it', async () => {
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([request()]) as never)
    vi.spyOn(approvalsApi, 'mine').mockResolvedValue(ok([]) as never)
    const reject = vi.spyOn(approvalsApi, 'reject').mockResolvedValue(ok({}) as never)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Reject request')).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: 'Reject' })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByPlaceholderText('Let them know why this was rejected'), {
      target: { value: '  Wrong plan  ' },
    })
    fireEvent.click(confirm)
    await waitFor(() => expect(reject).toHaveBeenCalledWith('req-1', 'Wrong plan'))
  })

  it('when the decision is refused (RBAC-04: 409 already decided), shows the reason and reloads the list', async () => {
    const list = vi
      .spyOn(approvalsApi, 'list')
      .mockResolvedValueOnce(ok([request()]) as never)
      .mockResolvedValue(ok([]) as never)
    vi.spyOn(approvalsApi, 'mine').mockResolvedValue(ok([]) as never)
    vi.spyOn(approvalsApi, 'approve').mockRejectedValue(apiError(409, 'This request was just decided by someone else'))
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(await screen.findByTestId('decision-error')).toHaveTextContent('This request was just decided by someone else')
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument()
  })

  it('shows only "Your requests" when the caller may not see the decision queue (403)', async () => {
    vi.spyOn(approvalsApi, 'list').mockRejectedValue(apiError(403, 'You do not have permission to see the approval inbox here'))
    vi.spyOn(approvalsApi, 'mine').mockResolvedValue(ok([request({ id: 'req-9', summary: 'Refund PKR 2,000' })]) as never)
    renderPage()

    expect(await screen.findByText('Refund PKR 2,000')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /waiting on you/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your requests' })).toBeInTheDocument()
    // Nobody can decide their own request from this list.
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('withdraws a pending request of your own after confirming', async () => {
    tabParam = 'mine'
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
    vi.spyOn(approvalsApi, 'mine').mockResolvedValue(
      ok([request(), request({ id: 'req-2', status: 'REJECTED', summary: 'Old request', decisionReason: 'Duplicate' })]) as never
    )
    const cancel = vi.spyOn(approvalsApi, 'cancel').mockResolvedValue(ok({}) as never)
    renderPage()

    expect(await screen.findByText('Old request')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /your requests/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Duplicate')).toBeInTheDocument()
    // Only the pending one can be withdrawn.
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(await screen.findByText('Withdraw this request?')).toBeInTheDocument()
    expect(
      screen.getByText('"Add member Ali Raza — Monthly plan" will no longer wait for approval.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('req-1'))
  })

  it('says when an approved request still needs its payment verified, or was collected up front', async () => {
    tabParam = 'mine'
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(
      ok([request({ id: 'req-3', collectedBy: 'user-desk', collectedAt: new Date().toISOString() })]) as never
    )
    vi.spyOn(approvalsApi, 'mine').mockResolvedValue(
      ok([request({ id: 'req-4', status: 'APPROVED', paymentStatus: 'STAFF_COLLECTED' })]) as never
    )
    renderPage()

    expect(
      await screen.findByText('Approved, but the payment still needs verifying — see the Payments page')
    ).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: /waiting on you/i }))
    expect(
      await screen.findByText('Payment already collected — rejecting this means returning it')
    ).toBeInTheDocument()
  })

  it('shows the empty states with the mobile wording', async () => {
    vi.spyOn(approvalsApi, 'list').mockResolvedValue(ok([]) as never)
    vi.spyOn(approvalsApi, 'mine').mockResolvedValue(ok([]) as never)
    renderPage()

    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument()
    expect(screen.getByText('Requests that need your decision will show up here.')).toBeInTheDocument()
  })
})

describe('202 on an approval-tier action', () => {
  it('reads 202 as "sent for approval", with the request id whichever field carries it', () => {
    expect(
      readApprovalOutcome({
        status: 202,
        data: ok({ status: 'PENDING', approvalRequestId: 'req-7', summary: 'Refund PKR 2,000' }),
      })
    ).toEqual({ pending: true, requestId: 'req-7', summary: 'Refund PKR 2,000' })

    // POST /actions/:key names it requestId.
    expect(readApprovalOutcome({ status: 202, data: ok({ status: 'PENDING', requestId: 'req-8' }) })).toEqual({
      pending: true,
      requestId: 'req-8',
      summary: null,
    })
  })

  it('reads 200/201 as done — a body that merely says PENDING is not an approval', () => {
    expect(readApprovalOutcome({ status: 200, data: ok({ status: 'PENDING' }) }).pending).toBe(false)
    expect(readApprovalOutcome({ status: 201, data: ok({ adjustment: {} }) }).pending).toBe(false)
  })

  it('the notice says it was submitted for approval, not done, and links to your requests', () => {
    render(<SubmittedForApprovalNotice summary="Refund PKR 2,000" />)

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Submitted for approval')
    expect(notice).toHaveTextContent('Refund PKR 2,000')
    expect(notice).toHaveTextContent(/nothing has changed yet/i)
    expect(within(notice).getByRole('link', { name: /view your requests/i })).toHaveAttribute(
      'href',
      '/gym/approvals?tab=mine'
    )
  })
})
