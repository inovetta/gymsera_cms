import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PaymentsPage from '@/app/(dashboard)/gym/payments/page'
import { paymentsApi } from '@/lib/api/payments'
import { gymApi } from '@/lib/api/gym'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, ownerContext, withPermissions } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))

let accountRole = 'MEMBER'
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', fullName: 'Test Person', role: accountRole },
    logout: vi.fn(),
    isPlatformAdmin: false,
    isGymHost: accountRole === 'GYM_HOST',
    isBranchManager: false,
  }),
}))

const pending = {
  id: 'pay-1', userId: 'u1', paymentFor: 'MEMBERSHIP', amount: 3000, currency: 'PKR', method: 'CASH',
  status: 'PENDING', createdAt: '2026-10-01T10:00:00.000Z', user: { fullName: 'Ali Raza' },
}

let getPayments: ReturnType<typeof vi.spyOn>

const render_ = (context: MyContext, branches = [{ id: 'branch-1', branchName: 'Uptown' }]) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches }) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentsPage />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  accountRole = 'MEMBER'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  getPayments = vi.spyOn(paymentsApi, 'getPayments').mockResolvedValue(ok({ payments: [pending] }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Payments page — sends the user’s branch (NEW-45g)', () => {
  it('a Front Desk user’s list request carries their branch (the server answers 400 without one)', async () => {
    render_(frontDeskContext)

    expect(await screen.findByText('Ali Raza')).toBeInTheDocument()
    expect(getPayments).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-1' }))
    expect(getPayments).not.toHaveBeenCalledWith(expect.objectContaining({ branchId: undefined }))
  })

  it('with several branches they choose, and the request follows the choice', async () => {
    const two = withPermissions(frontDeskContext, [])
    two.organizations[0].branches.push({ id: 'branch-2', name: 'Downtown', permissions: ['payments.view', 'payments.record'] })
    render_(two, [{ id: 'branch-1', branchName: 'Uptown' }, { id: 'branch-2', branchName: 'Downtown' }])

    const select = (await screen.findByLabelText('Branch')) as HTMLSelectElement
    expect(select.value).toBe('branch-1')
    fireEvent.change(select, { target: { value: 'branch-2' } })
    await waitFor(() => expect(getPayments).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-2' })))
  })

  it('only branches where payments.view is held are offered', async () => {
    const ctx = withPermissions(frontDeskContext, [])
    ctx.organizations[0].branches.push({ id: 'branch-2', name: 'Downtown', permissions: ['members.view'] })
    render_(ctx, [{ id: 'branch-1', branchName: 'Uptown' }, { id: 'branch-2', branchName: 'Downtown' }])

    await screen.findByText('Ali Raza')
    expect(screen.queryByLabelText('Branch')).not.toBeInTheDocument()
    expect(getPayments).not.toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-2' }))
  })

  it('the owner is unchanged: no branch filter by default, and may pick one', async () => {
    accountRole = 'GYM_HOST'
    render_(ownerContext, [{ id: 'branch-1', branchName: 'Uptown' }, { id: 'branch-2', branchName: 'Downtown' }])

    await screen.findByText('Ali Raza')
    expect(getPayments).toHaveBeenCalledWith(expect.not.objectContaining({ branchId: expect.anything() }))
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'branch-2' } })
    await waitFor(() => expect(getPayments).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'branch-2' })))
  })
})

describe('Payments page — buttons follow permissions, not isGymHost (NEW-45g)', () => {
  const titles = () => ({
    collect: screen.queryByTitle('Mark as Collected (Step 1)'),
    approve: screen.queryByTitle('Approve') ?? screen.queryByTitle('Final Approval (Step 2)'),
    reject: screen.queryByTitle('Reject'),
    record: screen.queryByRole('button', { name: /record payment/i }),
  })

  it('Front Desk (payments.record, no payments.verify): collect, reject and record, but no approve', async () => {
    render_(frontDeskContext)
    await screen.findByText('Ali Raza')

    const t = titles()
    expect(t.collect).toBeInTheDocument()
    expect(t.reject).toBeInTheDocument()
    expect(t.record).toBeInTheDocument()
    expect(t.approve).not.toBeInTheDocument()
    expect(screen.queryByText(/Step 2 \(You\)/)).not.toBeInTheDocument()
  })

  it('a Branch Manager with payments.verify gets the approve button although their account role is MEMBER', async () => {
    render_(withPermissions(frontDeskContext, ['payments.verify']))
    await screen.findByText('Ali Raza')

    expect(titles().approve).toBeInTheDocument()
    expect(screen.getByText(/Step 2 \(You\)/)).toBeInTheDocument()
  })

  it('someone with payments.view only (no payments.record) sees no collect, reject or record', async () => {
    const viewOnly: MyContext = withPermissions(frontDeskContext, [])
    viewOnly.organizations[0].branches[0].permissions = ['payments.view']
    render_(viewOnly)
    await screen.findByText('Ali Raza')

    const t = titles()
    expect(t.collect).not.toBeInTheDocument()
    expect(t.reject).not.toBeInTheDocument()
    expect(t.record).not.toBeInTheDocument()
  })

  it('the owner is unchanged: every button', async () => {
    accountRole = 'GYM_HOST'
    render_(ownerContext)
    await screen.findByText('Ali Raza')

    const t = titles()
    expect(t.collect && t.approve && t.reject && t.record).toBeTruthy()
  })

  it('the record dialog says "auto-approved" only to someone who records directly', async () => {
    render_(frontDeskContext)
    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    expect(await screen.findByText(/collect box/i)).toBeInTheDocument()
    expect(screen.queryByText(/automatically approved/i)).not.toBeInTheDocument()
  })
})
