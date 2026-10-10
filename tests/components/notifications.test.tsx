import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationBell } from '@/components/features/notifications/notification-bell'
import NotificationsPage from '@/app/(dashboard)/notifications/page'
import { notificationsApi } from '@/lib/api/notifications'
import { resolveNotificationPath } from '@/lib/notifications/links'
import { ok } from '../fixtures/team'

const push = vi.fn()
const toast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))

const httpError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })

const note = (id: string, extra: Record<string, unknown> = {}) => ({
  id, userId: 'u1', role: 'host', type: 'PAYMENT', title: `Title ${id}`, message: `Message ${id}`, priority: 'normal',
  isRead: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...extra,
})

let list: ReturnType<typeof vi.spyOn>
let unread: ReturnType<typeof vi.spyOn>
let markAsRead: ReturnType<typeof vi.spyOn>
let markAll: ReturnType<typeof vi.spyOn>

const withClient = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

beforeEach(() => {
  push.mockReset()
  toast.mockReset()
  list = vi.spyOn(notificationsApi, 'getNotifications').mockResolvedValue(
    ok({ notifications: [note('n1', { deepLink: '/host/subscriptions' }), note('n2', { isRead: true })] }) as never
  )
  unread = vi.spyOn(notificationsApi, 'getUnreadCount').mockResolvedValue(ok({ unreadCount: 3 }) as never)
  markAsRead = vi.spyOn(notificationsApi, 'markAsRead').mockResolvedValue(ok({ success: true }) as never)
  markAll = vi.spyOn(notificationsApi, 'markAllAsRead').mockResolvedValue(ok({ success: true }) as never)
})
afterEach(() => vi.restoreAllMocks())

const openBell = async () => {
  const bell = await screen.findByRole('button', { name: /Notifications/ })
  fireEvent.pointerDown(bell, { button: 0, ctrlKey: false })
  fireEvent.click(bell)
}

describe('Notification bell (UX-23)', () => {
  it('shows the server’s unread count, not a number counted in the browser', async () => {
    withClient(<NotificationBell />)
    // Two are listed (one unread) but the server says three are unread.
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('3')
  })

  it('lists the latest, marks one read on click and follows its mapped CMS page', async () => {
    withClient(<NotificationBell />)
    await openBell()
    fireEvent.click(await screen.findByText('Title n1'))

    await waitFor(() => expect(markAsRead).toHaveBeenCalledWith('n1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/gym/subscriptions'))
    // After a mark-read the count is asked for again.
    await waitFor(() => expect(unread.mock.calls.length).toBeGreaterThan(1))
  })

  it('mark all read', async () => {
    withClient(<NotificationBell />)
    await openBell()
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(markAll).toHaveBeenCalled())
  })

  it('server error: says why, with a retry, instead of a silent console error', async () => {
    list.mockRejectedValue(httpError(500, { message: 'Notification store is offline' }))
    withClient(<NotificationBell />)
    await openBell()

    expect(await screen.findByText('Notification store is offline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1))
  })

  it('a failed mark-read tells the person and does not claim success', async () => {
    markAsRead.mockRejectedValue(httpError(404, { message: 'Notification not found' }))
    withClient(<NotificationBell />)
    await openBell()
    fireEvent.click(await screen.findByText('Title n1'))

    await waitFor(() => expect(markAsRead).toHaveBeenCalled())
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not mark it as read', description: 'Notification not found', variant: 'destructive' })
      )
    )
  })

  it('empty: all caught up', async () => {
    list.mockResolvedValue(ok({ notifications: [] }) as never)
    unread.mockResolvedValue(ok({ unreadCount: 0 }) as never)
    withClient(<NotificationBell />)
    await openBell()
    expect(await screen.findByText('You are all caught up.')).toBeInTheDocument()
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument()
  })
})

describe('Notifications feed page', () => {
  it('pages through the server list and shows the unread total from the server', async () => {
    list.mockResolvedValue({
      ...ok({ notifications: [note('n1'), note('n2')] }),
      pagination: { totalItems: 45, currentPage: 1, totalPages: 3, limit: 20 },
    } as never)
    withClient(<NotificationsPage />)

    expect(await screen.findByText('3 unread')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(list).toHaveBeenCalledWith({ page: 2, limit: 20 }))
  })

  it('empty state', async () => {
    list.mockResolvedValue(ok({ notifications: [] }) as never)
    unread.mockResolvedValue(ok({ unreadCount: 0 }) as never)
    withClient(<NotificationsPage />)
    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
  })

  it('error state shows the server message', async () => {
    list.mockRejectedValue(httpError(500, { message: 'Notification store is offline' }))
    withClient(<NotificationsPage />)
    expect(await screen.findByText('Notification store is offline')).toBeInTheDocument()
  })
})

describe('deep links: server mobile routes map to CMS pages', () => {
  it.each([
    ['/host/today', '/dashboard'],
    ['/staff/dashboard', '/dashboard'],
    ['/host/subscriptions', '/gym/subscriptions'],
    ['/host/gyms?tab=subscriptions&filter=PENDING&subscriptionId=abc', '/gym/subscriptions'],
    ['/host/branches', '/gym/branches'],
    ['/host/profile', '/gym/profile'],
    ['/host/gyms/branch-9/staff', '/gym/team'],
    ['/host/gyms/branch-9/staff-requests', '/gym/team'],
    ['/admin/tenants/tenant-5', '/admin/tenants/tenant-5'],
    ['/notifications', '/notifications'],
  ])('%s opens %s', (link, expected) => {
    expect(resolveNotificationPath(link)).toBe(expected)
  })

  it('fills the tenant template from the metadata', () => {
    expect(resolveNotificationPath('/admin/tenants/[tenantId]', { tenantId: 't-7' })).toBe('/admin/tenants/t-7')
    expect(resolveNotificationPath('/admin/tenants/[tenantId]', {})).toBeNull()
  })

  it('has no page for the traveler screens or the host inbox: stays put, never a 404', () => {
    expect(resolveNotificationPath('/traveler/subscriptions')).toBeNull()
    expect(resolveNotificationPath('/host/inbox')).toBeNull()
    expect(resolveNotificationPath(null)).toBeNull()
  })
})
