import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AttendancePage from '@/app/(dashboard)/gym/attendance/page'
import { attendanceApi } from '@/lib/api/attendance'
import { reportsApi } from '@/lib/api/reports'
import { gymApi } from '@/lib/api/gym'
import { hostApi } from '@/lib/api/host'
import { subscriptionsApi } from '@/lib/api/subscriptions'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, ownerContext, withPermissions } from '../fixtures/context'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
// jsdom has no ResizeObserver; the weekly chart is not under test.
vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return { BarChart: Box, Bar: Box, XAxis: Box, YAxis: Box, CartesianGrid: Box, Tooltip: Box, ResponsiveContainer: Box }
})
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

const USER_ID = '11111111-1111-4111-8111-111111111111'
const BRANCH_1 = '22222222-2222-4222-8222-222222222222'
const SUB_A = '33333333-3333-4333-8333-333333333333'
const SUB_B = '44444444-4444-4444-8444-444444444444'

const future = '2999-01-01'
const sub = (id: string, over: Record<string, unknown> = {}) => ({
  id, userId: USER_ID, branchId: BRANCH_1, status: 'ACTIVE', endDate: future, remainingVisits: null,
  plan: { id: `plan-${id}`, name: `Plan ${id.slice(0, 2)}` }, ...over,
})

const httpError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

let manualCheckIn: ReturnType<typeof vi.spyOn>
let getStaffSubscriptions: ReturnType<typeof vi.spyOn>
let lookup: ReturnType<typeof vi.spyOn>

const context = withPermissions(frontDeskContext, ['checkins.manual.create'])
context.organizations[0].branches[0].id = BRANCH_1

const renderPage = (ctx: MyContext = context, branches = [{ id: BRANCH_1, branchName: 'Uptown' }]) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ctx) as never)
  vi.spyOn(gymApi, 'getBranches').mockResolvedValue(ok({ branches }) as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AttendancePage />
    </QueryClientProvider>
  )
}

/** Open the dialog, fill it in and press Record. */
const submit = async (email = 'ali@example.test') => {
  fireEvent.click(await screen.findByRole('button', { name: /manual check-in/i }))
  const dialog = await screen.findByRole('dialog')
  const branchSelect = within(dialog).getByRole('combobox') as HTMLSelectElement
  await waitFor(() => expect(within(branchSelect).getAllByRole('option').length).toBeGreaterThan(1))
  fireEvent.change(within(dialog).getByPlaceholderText('member@example.com'), { target: { value: email } })
  fireEvent.change(branchSelect, { target: { value: BRANCH_1 } })
  fireEvent.click(within(dialog).getByRole('button', { name: /record check-in/i }))
  return dialog
}

beforeEach(() => {
  accountRole = 'MEMBER'
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
  vi.spyOn(attendanceApi, 'getTodayAttendance').mockResolvedValue(ok({ logs: [] }) as never)
  vi.spyOn(attendanceApi, 'getAttendance').mockResolvedValue(ok({ logs: [] }) as never)
  vi.spyOn(reportsApi, 'getWeeklyAttendance').mockResolvedValue(ok({ data: [] }) as never)
  lookup = vi.spyOn(hostApi, 'lookupBranchMember').mockResolvedValue(
    ok({ exists: true, user: { id: USER_ID, fullName: 'Ali Raza', email: 'ali@example.test' } }) as never
  )
  getStaffSubscriptions = vi.spyOn(subscriptionsApi, 'getStaffSubscriptions').mockResolvedValue(
    ok({ subscriptions: [sub(SUB_A)] }) as never
  )
  manualCheckIn = vi.spyOn(attendanceApi, 'manualCheckIn').mockResolvedValue(ok({ log: { id: 'log-1' } }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Manual check-in (NEW-55)', () => {
  it('looks the member up at the chosen branch and posts userId, subscriptionId and branchId (server without lookup subscriptions: old call)', async () => {
    renderPage()
    await submit()

    await waitFor(() => expect(manualCheckIn).toHaveBeenCalledTimes(1))
    expect(lookup).toHaveBeenCalledWith(BRANCH_1, 'ali@example.test')
    expect(getStaffSubscriptions).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH_1, userId: USER_ID, status: 'ACTIVE' }))
    expect(manualCheckIn).toHaveBeenCalledWith({ userId: USER_ID, subscriptionId: SUB_A, branchId: BRANCH_1 })
    expect(manualCheckIn.mock.calls[0][0]).not.toHaveProperty('email')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says so when no member has that email at this branch, and posts nothing', async () => {
    lookup.mockResolvedValue(ok({ exists: false }) as never)
    renderPage()
    const dialog = await submit('nobody@example.test')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No member with the email nobody@example.test was found at this branch.')
    expect(manualCheckIn).not.toHaveBeenCalled()
  })

  it('says so when the member has no active subscription at this branch (expired ones do not count)', async () => {
    getStaffSubscriptions.mockResolvedValue(ok({ subscriptions: [sub(SUB_A, { endDate: '2020-01-01' }), sub(SUB_B, { remainingVisits: 0 })] }) as never)
    renderPage()
    const dialog = await submit()

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ali Raza has no active subscription at this branch.')
    expect(manualCheckIn).not.toHaveBeenCalled()
  })

  it('uses the one subscription that is still valid today when others have expired', async () => {
    getStaffSubscriptions.mockResolvedValue(ok({ subscriptions: [sub(SUB_A, { endDate: '2020-01-01' }), sub(SUB_B)] }) as never)
    renderPage()
    await submit()

    await waitFor(() => expect(manualCheckIn).toHaveBeenCalledWith({ userId: USER_ID, subscriptionId: SUB_B, branchId: BRANCH_1 }))
  })

  it('asks the user to choose when several subscriptions are valid, then posts the chosen one', async () => {
    getStaffSubscriptions.mockResolvedValue(ok({ subscriptions: [sub(SUB_A), sub(SUB_B, { remainingVisits: 4 })] }) as never)
    renderPage()
    const dialog = await submit()

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('more than one active subscription')
    expect(manualCheckIn).not.toHaveBeenCalled()
    const record = within(dialog).getByRole('button', { name: /record check-in/i })
    expect(record).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/subscription/i), { target: { value: SUB_B } })
    expect(record).not.toBeDisabled()
    fireEvent.click(record)

    await waitFor(() => expect(manualCheckIn).toHaveBeenCalledWith({ userId: USER_ID, subscriptionId: SUB_B, branchId: BRANCH_1 }))
  })

  it('shows the server’s message when the member is already checked in (409)', async () => {
    manualCheckIn.mockRejectedValue(httpError(409, { message: 'Member already checked in at 10:32', code: 'ALREADY_CHECKED_IN' }))
    renderPage()
    const dialog = await submit()

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Member already checked in at 10:32')
  })

  it('shows a no-permission message for a 403 with no server text, and the server text when it has one', async () => {
    manualCheckIn.mockRejectedValueOnce(httpError(403, {}))
    renderPage()
    const dialog = await submit()
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You do not have permission to check members in at this branch.')

    manualCheckIn.mockRejectedValueOnce(httpError(403, { message: 'Subscription is frozen' }))
    fireEvent.click(within(dialog).getByRole('button', { name: /record check-in/i }))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Subscription is frozen'))
  })

  it('a 403 on the member lookup says the user cannot look members up here', async () => {
    lookup.mockRejectedValue(httpError(403, {}))
    renderPage()
    const dialog = await submit()

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You do not have permission to look up members at this branch.')
    expect(manualCheckIn).not.toHaveBeenCalled()
  })

  it('shows which field the server rejected on a 422, not the generic text', async () => {
    manualCheckIn.mockRejectedValue(httpError(422, {
      message: 'Validation failed', code: 'validation_error',
      errors: [{ field: 'subscriptionId', message: 'subscriptionId must be a valid UUID' }],
    }))
    renderPage()
    const dialog = await submit()

    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent('subscriptionId must be a valid UUID')
    expect(alert).not.toHaveTextContent('Failed to record check-in')
  })

  it('lists only the branches where the user holds checkins.manual.create', async () => {
    const two = withPermissions(frontDeskContext, [])
    two.organizations[0].branches = [
      { id: BRANCH_1, name: 'Uptown', permissions: ['checkins.manual.create'] },
      { id: 'branch-2', name: 'Downtown', permissions: ['checkins.view'] },
    ]
    renderPage(two, [{ id: BRANCH_1, branchName: 'Uptown' }, { id: 'branch-2', branchName: 'Downtown' }])
    fireEvent.click(await screen.findByRole('button', { name: /manual check-in/i }))
    const dialog = await screen.findByRole('dialog')

    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Uptown' })).toBeInTheDocument())
    expect(within(dialog).queryByRole('option', { name: 'Downtown' })).not.toBeInTheDocument()
  })

  it('the owner sees every branch', async () => {
    renderPage(ownerContext, [{ id: BRANCH_1, branchName: 'Uptown' }, { id: 'branch-2', branchName: 'Downtown' }])
    fireEvent.click(await screen.findByRole('button', { name: /manual check-in/i }))
    const dialog = await screen.findByRole('dialog')

    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Downtown' })).toBeInTheDocument())
    expect(within(dialog).getByRole('option', { name: 'Uptown' })).toBeInTheDocument()
  })
})

describe('Manual check-in uses the subscriptions from the member lookup (NEW-57)', () => {
  const lookupWith = (subscriptions: unknown) =>
    ok({ exists: true, user: { id: USER_ID, fullName: 'Ali Raza', email: 'ali@example.test' }, subscriptions }) as never
  const item = (id: string, over: Record<string, unknown> = {}) =>
    ({ id, planName: `Plan ${id.slice(0, 2)}`, endDate: future, remainingVisits: null, ...over })

  it('posts the subscription id from the lookup and never calls /subscriptions/staff', async () => {
    lookup.mockResolvedValue(lookupWith([item(SUB_B)]))
    renderPage()
    await submit()

    await waitFor(() => expect(manualCheckIn).toHaveBeenCalledWith({ userId: USER_ID, subscriptionId: SUB_B, branchId: BRANCH_1 }))
    expect(getStaffSubscriptions).not.toHaveBeenCalled()
  })

  it('keeps the picker when the lookup returns several, and posts the chosen one', async () => {
    lookup.mockResolvedValue(lookupWith([item(SUB_A), item(SUB_B, { remainingVisits: 4 })]))
    renderPage()
    const dialog = await submit()

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('more than one active subscription')
    expect(manualCheckIn).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText(/subscription/i), { target: { value: SUB_B } })
    fireEvent.click(within(dialog).getByRole('button', { name: /record check-in/i }))

    await waitFor(() => expect(manualCheckIn).toHaveBeenCalledWith({ userId: USER_ID, subscriptionId: SUB_B, branchId: BRANCH_1 }))
    expect(getStaffSubscriptions).not.toHaveBeenCalled()
  })

  it('an empty list from the lookup means no active subscription (no fallback call)', async () => {
    lookup.mockResolvedValue(lookupWith([]))
    renderPage()
    const dialog = await submit()

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ali Raza has no active subscription at this branch.')
    expect(getStaffSubscriptions).not.toHaveBeenCalled()
    expect(manualCheckIn).not.toHaveBeenCalled()
  })

  it('falls back to /subscriptions/staff when the lookup omits the field', async () => {
    lookup.mockResolvedValue(lookupWith(undefined))
    renderPage()
    await submit()

    await waitFor(() => expect(manualCheckIn).toHaveBeenCalledWith({ userId: USER_ID, subscriptionId: SUB_A, branchId: BRANCH_1 }))
    expect(getStaffSubscriptions).toHaveBeenCalledTimes(1)
  })

  it('still says the member was not found when the lookup finds nobody', async () => {
    lookup.mockResolvedValue(ok({ exists: false, subscriptions: [] }) as never)
    renderPage()
    const dialog = await submit('nobody@example.test')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No member with the email nobody@example.test was found at this branch.')
    expect(getStaffSubscriptions).not.toHaveBeenCalled()
  })
})
