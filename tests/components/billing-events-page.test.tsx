import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BillingEventsPage from '@/app/(dashboard)/admin/billing-events/page'
import { StatusBadge } from '@/components/features/status-badge'
import { adminApi, type BillingEvent } from '@/lib/api/admin'
import { axeViolations } from '../helpers/axe'

// OBS-05: platform admins see every billing webhook/RTDN event, can filter by organization and status,
// see which ones need attention, and never see a raw provider payload.
let searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/admin/billing-events',
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/layout/header', () => ({ Header: ({ title }: { title: string }) => <div data-testid="header">{title}</div> }))

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const TENANT_B = '22222222-2222-4222-8222-222222222222'

const event = (over: Partial<BillingEvent> & Record<string, unknown> = {}): BillingEvent => ({
  id: `evt-${Math.random().toString(36).slice(2)}`,
  provider: 'APPLE',
  providerEventId: 'uuid-0001',
  eventType: 'DID_RENEW',
  status: 'PROCESSED',
  attempts: 1,
  lastError: null,
  tenantId: TENANT_A,
  tenantName: 'Alpha Fitness',
  receivedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  processedAt: new Date().toISOString(),
  stuck: false,
  ...over,
})

const page = (items: BillingEvent[], extra: Partial<{ total: number; page: number; limit: number; totalPages: number }> = {}) => ({
  success: true,
  message: 'OK',
  data: items,
  pagination: { total: items.length, page: 1, limit: 20, totalPages: 1, ...extra },
})

const tenants = {
  success: true,
  message: 'OK',
  data: {
    tenants: [
      { id: TENANT_A, businessName: 'Alpha Fitness' },
      { id: TENANT_B, businessName: 'Beta Fitness' },
    ],
  },
}

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BillingEventsPage />
    </QueryClientProvider>
  )
}

let list: ReturnType<typeof vi.spyOn>
const statusButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}$`) })
const lastParams = () => (list.mock.calls[list.mock.calls.length - 1][0] ?? {}) as Record<string, unknown>

beforeEach(() => {
  searchParams = new URLSearchParams()
  vi.spyOn(adminApi, 'getTenants').mockResolvedValue(tenants as never)
  list = vi.spyOn(adminApi, 'getBillingEvents')
})
afterEach(() => vi.restoreAllMocks())

describe('billing events: the list', () => {
  it('shows each event with provider, type, organization, status and attempts', async () => {
    list.mockResolvedValue(
      page([
        event({ providerEventId: 'uuid-renew', eventType: 'DID_RENEW', status: 'PROCESSED' }),
        event({ provider: 'STRIPE', providerEventId: 'evt_stripe_1', eventType: 'customer.subscription.updated', status: 'FAILED', attempts: 6, lastError: 'Stripe API timeout', tenantId: TENANT_B, tenantName: 'Beta Fitness' }),
        event({ provider: 'GOOGLE', providerEventId: 'pubsub-9', eventType: null, status: 'IGNORED', tenantId: null, tenantName: null }),
      ]) as never
    )
    renderPage()
    expect(await screen.findByText('uuid-renew')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('Apple')).toBeInTheDocument()
    expect(within(table).getByText('Stripe')).toBeInTheDocument()
    expect(within(table).getByText('Google Play')).toBeInTheDocument()
    expect(within(table).getByText('DID_RENEW')).toBeInTheDocument()
    expect(within(table).getByText('Alpha Fitness')).toBeInTheDocument()
    expect(within(table).getByText('Beta Fitness')).toBeInTheDocument()
    expect(within(table).getByText('Not matched to an organization')).toBeInTheDocument()
    expect(within(table).getByText('6')).toBeInTheDocument()
    expect(within(table).getByText('Stripe API timeout')).toBeInTheDocument()
  })

  it('links the organization to its admin page', async () => {
    list.mockResolvedValue(page([event()]) as never)
    renderPage()
    const link = await screen.findByRole('link', { name: 'Alpha Fitness' })
    expect(link).toHaveAttribute('href', `/admin/tenants/${TENANT_A}`)
  })

  it('flags only the events that need attention', async () => {
    list.mockResolvedValue(
      page([
        event({ providerEventId: 'fine-1' }),
        event({ providerEventId: 'stuck-1', status: 'RECEIVED', stuck: true, processedAt: null }),
        event({ providerEventId: 'fresh-1', status: 'RECEIVED', stuck: false, processedAt: null }),
      ]) as never
    )
    renderPage()
    await screen.findByText('stuck-1')
    const rowOf = (id: string) => screen.getByText(id).closest('tr') as HTMLElement
    expect(within(rowOf('stuck-1')).getByText('Needs attention')).toBeInTheDocument()
    expect(within(rowOf('fine-1')).queryByText('Needs attention')).toBeNull()
    expect(within(rowOf('fresh-1')).queryByText('Needs attention')).toBeNull()
    expect(rowOf('stuck-1')).toHaveAttribute('data-stuck', 'true')
    // the rule is written on the page, not hidden in a tooltip
    expect(screen.getByText(/waiting more than 10 minutes/i)).toBeInTheDocument()
  })

  it('never shows a raw payload, even if the API were to send one', async () => {
    list.mockResolvedValue(page([event({ rawPayload: '{"signedPayload":"SECRET-RECEIPT-DATA"}', payload: 'SECRET-RECEIPT-DATA' })]) as never)
    const { container } = renderPage()
    await screen.findByText('uuid-0001')
    expect(container.textContent).not.toContain('SECRET-RECEIPT-DATA')
    expect(screen.queryByText(/payload/i)).toBeNull()
  })

  it('has no accessibility violations when populated', async () => {
    list.mockResolvedValue(page([event(), event({ status: 'FAILED', stuck: true, attempts: 7, lastError: 'boom' })]) as never)
    const { container } = renderPage()
    await screen.findByText('boom')
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('billing events: filters and paging', () => {
  it('asks for the first page of everything by default', async () => {
    list.mockResolvedValue(page([event()]) as never)
    renderPage()
    await screen.findByText('uuid-0001')
    expect(lastParams()).toMatchObject({ page: 1 })
    expect(lastParams().status).toBeUndefined()
    expect(lastParams().tenantId).toBeUndefined()
  })

  it('filters by status, and shows which filter is on', async () => {
    list.mockResolvedValue(page([event()]) as never)
    renderPage()
    await screen.findByText('uuid-0001')
    expect(statusButton('All')).toHaveAttribute('aria-pressed', 'true')
    expect(statusButton('Failed')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(statusButton('Failed'))
    await waitFor(() => expect(lastParams().status).toBe('FAILED'))
    expect(statusButton('Failed')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(statusButton('All'))
    await waitFor(() => expect(lastParams().status).toBeUndefined())
  })

  it('filters by organization, including "not matched to an organization"', async () => {
    list.mockResolvedValue(page([event()]) as never)
    renderPage()
    await screen.findByText('uuid-0001')
    const select = await screen.findByLabelText('Organization')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Beta Fitness' })).toBeInTheDocument())
    fireEvent.change(select, { target: { value: TENANT_B } })
    await waitFor(() => expect(lastParams().tenantId).toBe(TENANT_B))
    fireEvent.change(select, { target: { value: 'none' } })
    await waitFor(() => expect(lastParams().tenantId).toBe('none'))
    fireEvent.change(select, { target: { value: '' } })
    await waitFor(() => expect(lastParams().tenantId).toBeUndefined())
  })

  it('opens already filtered when linked with ?tenantId= (from a tenant page)', async () => {
    searchParams = new URLSearchParams(`tenantId=${TENANT_B}`)
    list.mockResolvedValue(page([event()]) as never)
    renderPage()
    await screen.findByText('uuid-0001')
    expect(lastParams().tenantId).toBe(TENANT_B)
    await waitFor(() => expect((screen.getByLabelText('Organization') as HTMLSelectElement).value).toBe(TENANT_B))
  })

  it('ignores a ?tenantId= that is not an id (the server would answer 422)', async () => {
    searchParams = new URLSearchParams('tenantId=<script>')
    list.mockResolvedValue(page([event()]) as never)
    renderPage()
    await screen.findByText('uuid-0001')
    expect(lastParams().tenantId).toBeUndefined()
  })

  it('changing a filter goes back to page 1', async () => {
    list.mockResolvedValue(page([event()], { total: 45, totalPages: 3 }) as never)
    renderPage()
    await screen.findByText('uuid-0001')
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(lastParams().page).toBe(2))
    fireEvent.click(statusButton('Failed'))
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, status: 'FAILED' }))
  })

  it('pages through the results', async () => {
    list.mockResolvedValue(page([event()], { total: 45, totalPages: 3 }) as never)
    renderPage()
    await screen.findByText('Page 1 of 3')
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await screen.findByText('Page 2 of 3')
    expect(lastParams().page).toBe(2)
  })
})

describe('billing events: loading, empty, error and 403', () => {
  it('shows a loading skeleton, not an empty list, while the first load runs', async () => {
    list.mockReturnValue(new Promise(() => {}) as never)
    renderPage()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText(/no billing events/i)).toBeNull()
    expect(document.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0)
  })

  it('says there are no events yet when nothing is stored and no filter is set', async () => {
    list.mockResolvedValue(page([]) as never)
    renderPage()
    expect(await screen.findByText('No billing events yet')).toBeInTheDocument()
  })

  it('says nothing matches when a filter is set, and offers to clear it', async () => {
    list.mockResolvedValue(page([]) as never)
    renderPage()
    await screen.findByText('No billing events yet')
    fireEvent.click(statusButton('Failed'))
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    await waitFor(() => expect(lastParams().status).toBeUndefined())
  })

  it('a failed load is an error with a reference and Retry, never an empty list', async () => {
    list.mockRejectedValueOnce({ response: { status: 503, data: { error: { code: 'internal_error', message: 'Service unavailable', requestId: 'req_be_1' } } } })
    renderPage()
    const state = await screen.findByTestId('error-state')
    expect(state).toHaveTextContent('req_be_1')
    expect(screen.queryByText(/no billing events/i)).toBeNull()
    list.mockResolvedValue(page([event({ providerEventId: 'after-retry' })]) as never)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('after-retry')).toBeInTheDocument()
  })

  it('a network failure is retryable too', async () => {
    list.mockRejectedValueOnce({ message: 'Network Error' })
    renderPage()
    await screen.findByTestId('error-state')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('403: says it is for platform administrators, offers no Retry, shows no table or filters', async () => {
    list.mockRejectedValue({ response: { status: 403, data: { error: { code: 'forbidden', message: 'Forbidden', requestId: 'req_403' } } } })
    renderPage()
    const notice = await screen.findByTestId('no-access')
    expect(notice).toHaveTextContent(/platform administrators/i)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByLabelText('Organization')).toBeNull()
  })

  it('the organization filter still works when the organization list fails to load', async () => {
    vi.spyOn(adminApi, 'getTenants').mockRejectedValue({ message: 'Network Error' })
    list.mockResolvedValue(page([event()]) as never)
    renderPage()
    expect(await screen.findByText('uuid-0001')).toBeInTheDocument()
    expect(screen.getByLabelText('Organization')).toBeInTheDocument()
  })
})

describe('status badge knows the billing event statuses', () => {
  it.each([
    ['RECEIVED', 'Waiting'],
    ['PROCESSED', 'Processed'],
    ['IGNORED', 'Ignored'],
    ['FAILED', 'Failed'],
  ])('%s is shown as %s', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
