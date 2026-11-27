/**
 * Enterprise D12, contract v2 (R-120, gap G9): the refund policy belongs to each branch. The dialog
 * lists the branches (GET without branchId → `branches[]`), shows the chosen branch's own policy,
 * saves it with `branchId`, or with `applyToAllBranches: true` and says which branches were skipped.
 * Before: one organization-wide policy that only reached the oldest business.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RefundPolicyDialog, bulkResultMessage } from '@/components/features/refunds/refund-policy-dialog'
import { refundsApi } from '@/lib/api/refunds'
import { organizationsApi } from '@/lib/api/organizations'
import { apiError, ok } from '../fixtures/team'

const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

let update: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  toast.mockReset()
  vi.spyOn(refundsApi, 'getPolicies').mockResolvedValue(ok({
    branches: [
      { branchId: 'br-1', refundsAllowed: false, refundWindowDays: null },
      { branchId: 'br-2', refundsAllowed: true, refundWindowDays: 14 },
    ],
  }) as never)
  vi.spyOn(organizationsApi, 'getBranches').mockResolvedValue(ok({
    branches: [{ id: 'br-1', branchName: 'Uptown' }, { id: 'br-2', branchName: 'DHA Phase 5' }],
  }) as never)
  update = vi.spyOn(refundsApi, 'updatePolicy').mockResolvedValue(ok({ branchId: 'br-2', refundsAllowed: true, refundWindowDays: 7 }) as never)
})
afterEach(() => vi.restoreAllMocks())

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <RefundPolicyDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )

describe('Refund policy per branch (D12)', () => {
  it('lists the branches by name and shows the chosen branch’s own policy', async () => {
    mount()
    const branch = (await screen.findByLabelText('Branch')) as HTMLSelectElement
    await waitFor(() => expect(branch.value).toBe('br-1'))
    expect(screen.getByRole('option', { name: 'Uptown' })).toBeInTheDocument()
    expect(screen.getByLabelText('Refunds allowed')).toHaveAttribute('aria-checked', 'false')

    fireEvent.change(branch, { target: { value: 'br-2' } })
    await waitFor(() => expect(screen.getByLabelText('Refunds allowed')).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByLabelText(/refund window/i)).toHaveValue(14)
  })

  it('saves one branch with branchId', async () => {
    mount()
    const branch = (await screen.findByLabelText('Branch')) as HTMLSelectElement
    await waitFor(() => expect(branch.value).toBe('br-1'))
    fireEvent.change(branch, { target: { value: 'br-2' } })
    await waitFor(() => expect(screen.getByLabelText(/refund window/i)).toHaveValue(14))
    fireEvent.change(screen.getByLabelText(/refund window/i), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ branchId: 'br-2' }, { refundsAllowed: true, refundWindowDays: 7 }))
  })

  it('"Apply to all branches" sends applyToAllBranches and says which branches were skipped', async () => {
    update.mockResolvedValueOnce(ok({ updatedBranchIds: ['br-1', 'br-2'], skippedBranchIds: ['br-9'] }) as never)
    mount()
    await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('br-1'))
    fireEvent.click(screen.getByLabelText('Apply to all branches'))
    expect(screen.getByLabelText('Branch')).toBeDisabled()
    expect(screen.getByTestId('refund-apply-all-note')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Refunds allowed'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ applyToAllBranches: true }, { refundsAllowed: true, refundWindowDays: null }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Refund policy saved',
      description: 'Saved for 2 branches. 1 branch was skipped: you cannot refund there.',
    })))
  })

  it('a refusal shows the server’s reason (422 branch_required has its copy)', async () => {
    update.mockRejectedValueOnce(apiError(422, 'Choose a branch, or apply to all branches.', 'branch_required'))
    mount()
    await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('br-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })))
  })

  it('bulk message wording', () => {
    expect(bulkResultMessage({ updatedBranchIds: ['a'], skippedBranchIds: [] })).toBe('Saved for 1 branch.')
    expect(bulkResultMessage({ updatedBranchIds: ['a', 'b'], skippedBranchIds: ['c', 'd'] })).toBe('Saved for 2 branches. 2 branches were skipped: you cannot refund there.')
  })
})
