import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PlansPage from '@/app/(dashboard)/gym/plans/page'
import { plansApi } from '@/lib/api/plans'
import { gymApi } from '@/lib/api/gym'
import { ok } from '../fixtures/team'

/**
 * Phase 7 P9b, NEW-112 / R-77 / R-80 (the CMS half of P4).
 * Before: /gym/plans had no "Show to Travellers" control (plansApi had no call to
 * POST /membership-plans/:id/public), so a plan created in the CMS could never be shown to
 * travellers from the CMS, and the last visible plan could be deactivated or deleted without a word;
 * the price label said "PKR" and every amount was formatted as PKR whatever the plan's currency;
 * QUARTERLY 1 read "1 Quarter" while the API sells it as 3 months (mobile planDurationLabel).
 */
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }))
// jsdom has no ResizeObserver; the Radix switch measures itself with one.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}))

const plan = (over: Record<string, unknown>) => ({
  gymId: 'g1', description: '', durationType: 'MONTHLY', durationValue: 1, price: 5000, joiningFee: 0, securityFee: 0,
  freezeLimitDays: 0, isTrial: false, status: 'ACTIVE', isDeactivated: false, isPublic: true, currency: 'PKR', ...over,
})

// b1 has one visible plan (p1) and a hidden one (p2); b2 has only a hidden plan (p3): not live for travellers.
const p1 = plan({ id: 'p1', name: 'Monthly', branchId: 'b1', branch: { branchName: 'Uptown' } })
const p2 = plan({ id: 'p2', name: 'Walk-in', branchId: 'b1', branch: { branchName: 'Uptown' }, isPublic: false })
const p3 = plan({ id: 'p3', name: 'Quarter Pass', branchId: 'b2', branch: { branchName: 'Downtown' }, isPublic: false, durationType: 'QUARTERLY', durationValue: 1, price: 99, currency: 'USD' })
const branches = [
  { id: 'b1', branchName: 'Uptown', status: 'ACTIVE', currency: 'PKR' },
  { id: 'b2', branchName: 'Downtown', status: 'ACTIVE', currency: 'USD' },
]

let togglePublic: ReturnType<typeof vi.fn>
let toggleStatus: ReturnType<typeof vi.spyOn>
let deletePlan: ReturnType<typeof vi.spyOn>
let createPlan: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.spyOn(plansApi, 'getHostPlans').mockResolvedValue(ok({ plans: [p1, p2, p3] }) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches }) as never)
  togglePublic = vi.fn().mockResolvedValue(ok({ isPublic: true }))
  ;(plansApi as any).togglePlanPublic = togglePublic
  toggleStatus = vi.spyOn(plansApi, 'togglePlanStatus').mockResolvedValue(ok({}) as never)
  deletePlan = vi.spyOn(plansApi, 'deletePlan').mockResolvedValue(ok(null) as never)
  createPlan = vi.spyOn(plansApi, 'createPlan').mockResolvedValue(ok({}) as never)
})
afterEach(() => { vi.restoreAllMocks(); toastSpy.mockClear() })

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <PlansPage />
    </QueryClientProvider>
  )

const card = (id: string) => screen.getByTestId(`plan-card-${id}`)

describe('P9b: Show to Travellers on /gym/plans (NEW-112, R-77)', () => {
  it('each plan says whether travellers see it', async () => {
    mount()
    await screen.findByTestId('plan-card-p1')
    expect(within(card('p1')).getByText('Shown to travellers')).toBeInTheDocument()
    expect(within(card('p2')).getByText('Hidden from travellers')).toBeInTheDocument()
  })

  it('"Show to Travellers" on a hidden plan calls POST /membership-plans/:id/public', async () => {
    mount()
    await screen.findByTestId('plan-card-p2')
    fireEvent.click(within(card('p2')).getByRole('button', { name: 'Show to Travellers' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Make Public' }))
    await waitFor(() => expect(togglePublic).toHaveBeenCalledWith('p2'))
  })

  it('the last visible plan of a branch cannot be hidden, deactivated or deleted (same rule as the app)', async () => {
    mount()
    await screen.findByTestId('plan-card-p1')
    for (const action of ['Hide from Travellers', 'Deactivate', 'Delete Plan']) {
      fireEvent.click(within(card('p1')).getByRole('button', { name: action }))
      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByText(/Travellers must always see at least one plan at each branch/)).toBeInTheDocument()
      fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    }
    expect(togglePublic).not.toHaveBeenCalled()
    expect(toggleStatus).not.toHaveBeenCalled()
    expect(deletePlan).not.toHaveBeenCalled()
  })

  it('a branch with no traveller-visible plan is named, with the visible_plan_required copy', async () => {
    mount()
    const notice = await screen.findByTestId('branches-not-live')
    expect(within(notice).getByText(/Downtown/)).toBeInTheDocument()
    expect(within(notice).queryByText(/Uptown/)).not.toBeInTheDocument()
    expect(within(notice).getByText(/Turn on "Show to Travellers" for at least one plan, then try again\./)).toBeInTheDocument()
  })

  it('a refusal from the API shows its plain copy, not "Failed"', async () => {
    togglePublic.mockRejectedValue({ response: { status: 422, data: { success: false, code: 'last_visible_plan', message: 'raw server text' } } })
    mount()
    await screen.findByTestId('plan-card-p2')
    fireEvent.click(within(card('p2')).getByRole('button', { name: 'Show to Travellers' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Make Public' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalled())
    const shown = JSON.stringify(toastSpy.mock.calls)
    expect(shown).toMatch(/Travellers must always see at least one plan at each branch/)
    expect(shown).not.toMatch(/raw server text|Failed/)
  })

  it('the create form has the Show to Travellers switch and sends isPublic', async () => {
    mount()
    await screen.findByTestId('plan-card-p1')
    fireEvent.click(screen.getAllByRole('button', { name: /create plan/i })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('switch', { name: 'Show to Travellers' })).toBeChecked()
    fireEvent.change(within(dialog).getByLabelText(/plan name/i), { target: { value: 'Day Pass' } })
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Show to Travellers' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /^create plan$/i }))
    await waitFor(() => expect(createPlan).toHaveBeenCalled())
    expect(createPlan.mock.calls[0][0]).toMatchObject({ name: 'Day Pass', isPublic: false })
  })
})

describe('P9b: plan currency and naming from the server (R-80)', () => {
  it('amounts use the plan currency and QUARTERLY n is 3n months', async () => {
    mount()
    await screen.findByTestId('plan-card-p3')
    const c = card('p3')
    expect(within(c).getByText('3 Months')).toBeInTheDocument()
    expect(within(c).getByText(/\$\s?99|US\$\s?99|USD\s?99/)).toBeInTheDocument()
    expect(within(c).queryByText(/Rs|PKR/)).not.toBeInTheDocument()
  })

  it('the price label names the currency of the branch the plan is for, never a fixed PKR', async () => {
    mount()
    await screen.findByTestId('plan-card-p1')
    fireEvent.click(within(card('p3')).getByRole('button', { name: 'Edit Plan' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Price (USD) *')).toBeInTheDocument()
    expect(within(dialog).queryByText(/PKR/)).not.toBeInTheDocument()
  })

  it('the plan name is shown as typed, trimmed (no added words)', async () => {
    vi.spyOn(plansApi, 'getHostPlans').mockResolvedValue(ok({ plans: [{ ...p1, name: '  Monthly  ' }, p2, p3] }) as never)
    mount()
    await screen.findByTestId('plan-card-p1')
    expect(within(card('p1')).getByRole('heading', { name: 'Monthly' })).toBeInTheDocument()
  })
})
