import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ModerationPage from '@/app/(dashboard)/admin/moderation/page'
import apiClient from '@/lib/api/client'
import { parseWordList } from '@/lib/api/moderation'
import { ok } from '../fixtures/team'

/**
 * NEW-256 (App Store 1.2, Google Play UGC policy): Moderation › Reports and Moderation › Word list.
 * The queue shows the open and overdue counts (24-hour target), each report's text, reason, author
 * and reporter, and only the actions the server allows; an action is confirmed first and sends
 * PATCH /admin/reports/:id { action, adminNote }. The word list is one word per line and is saved
 * with PUT /admin/moderation/words.
 */
vi.mock('@/components/layout/header', () => ({ Header: () => <div /> }))
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }))

const reviewReport = {
  id: 'rep-1', reporterUserId: 'u1', targetType: 'REVIEW', targetId: 'rev-1', targetUserId: 'u2', conversationId: null,
  organizationId: 't1', reason: 'HARASSMENT', note: 'insults the staff', snapshotText: 'Terrible\nThe owner is rude', status: 'OPEN',
  action: null, adminNote: null, handledAt: null, createdAt: '2026-11-15T08:00:00Z', ageHours: 26, overdue: true,
  allowedActions: ['DISMISS', 'HIDE_REVIEW', 'SUSPEND_USER'],
  reporter: { id: 'u1', fullName: 'Sara Reporter' }, targetUser: { id: 'u2', fullName: 'Ali Author', status: 'ACTIVE' },
}
const messageReport = {
  ...reviewReport, id: 'rep-2', targetType: 'MESSAGE', targetId: 'msg-1', reason: 'SPAM', note: null,
  snapshotText: 'Buy cheap pills', ageHours: 2, overdue: false, allowedActions: ['DISMISS', 'DELETE_MESSAGE', 'SUSPEND_USER'],
}

let get: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  get = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/admin/reports') return { data: ok({ reports: [reviewReport, messageReport], counts: { open: 2, overdue: 1 }, responseHours: 24 }) }
    if (url === '/admin/moderation/words') return { data: ok({ words: ['bitch', 'scam'] }) }
    throw new Error(`unexpected GET ${url}`)
  }) as never
})
afterEach(() => { vi.restoreAllMocks(); toastSpy.mockClear() })

const mount = () =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ModerationPage /></QueryClientProvider>)

describe('Moderation › Reports', () => {
  it('opens on the OPEN queue with the counts and the 24-hour target', async () => {
    mount()
    const counts = await screen.findByTestId('report-counts')
    expect(counts).toHaveTextContent('2 open')
    expect(counts).toHaveTextContent('1 overdue (older than 24 hours)')
    expect(get).toHaveBeenCalledWith('/admin/reports', { params: { status: 'OPEN', targetType: undefined, limit: 50 } })
  })

  it('shows the reported text, reason, author, reporter, note and the overdue badge', async () => {
    mount()
    const card = await screen.findByTestId('report-rep-1')
    expect(card).toHaveTextContent('Terrible')
    expect(card).toHaveTextContent('Harassment or bullying')
    expect(card).toHaveTextContent('Ali Author')
    expect(card).toHaveTextContent('Sara Reporter')
    expect(card).toHaveTextContent('insults the staff')
    expect(card).toHaveTextContent('Overdue')
  })

  it('offers only the actions the server allows for each type', async () => {
    mount()
    const review = within(await screen.findByTestId('report-rep-1'))
    expect(review.getByRole('button', { name: 'Hide review' })).toBeInTheDocument()
    expect(review.queryByRole('button', { name: 'Delete message' })).toBeNull()
    const message = within(screen.getByTestId('report-rep-2'))
    expect(message.getByRole('button', { name: 'Delete message' })).toBeInTheDocument()
    expect(message.queryByRole('button', { name: 'Hide review' })).toBeNull()
  })

  it('an action is confirmed first, then sends the action and the note', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: ok({ report: { ...reviewReport, status: 'ACTIONED' }, closedOthers: 1 }) } as never)
    mount()
    const card = within(await screen.findByTestId('report-rep-1'))
    fireEvent.click(card.getByRole('button', { name: 'Hide review' }))
    expect(patch).not.toHaveBeenCalled()
    expect(card.getByText(/disappears from the gym page for everyone/)).toBeInTheDocument()
    fireEvent.change(card.getByLabelText('Admin note (optional)'), { target: { value: 'abusive' } })
    fireEvent.click(card.getByRole('button', { name: 'Confirm: Hide review' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/reports/rep-1', { action: 'HIDE_REVIEW', adminNote: 'abusive' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: '1 other report on the same item closed too.' })))
  })

  it('Cancel sends nothing; an empty note is not sent', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: ok({ report: messageReport, closedOthers: 0 }) } as never)
    mount()
    const card = within(await screen.findByTestId('report-rep-2'))
    fireEvent.click(card.getByRole('button', { name: 'Delete message' }))
    fireEvent.click(card.getByRole('button', { name: 'Cancel' }))
    expect(patch).not.toHaveBeenCalled()
    fireEvent.click(card.getByRole('button', { name: 'Dismiss' }))
    fireEvent.click(card.getByRole('button', { name: 'Confirm: Dismiss' }))
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/reports/rep-2', { action: 'DISMISS' }))
  })

  it('a refused action shows the server\'s message', async () => {
    vi.spyOn(apiClient, 'patch').mockRejectedValue({ response: { status: 409, data: { message: 'This report is already closed', code: 'report_closed' } } })
    mount()
    const card = within(await screen.findByTestId('report-rep-2'))
    fireEvent.click(card.getByRole('button', { name: 'Dismiss' }))
    fireEvent.click(card.getByRole('button', { name: 'Confirm: Dismiss' }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not update the report', variant: 'destructive' })))
  })

  it('filters by content type', async () => {
    mount()
    await screen.findByTestId('report-rep-1')
    const chat = screen.getByRole('tab', { name: 'Chat' })
    fireEvent.mouseDown(chat)
    fireEvent.click(chat)
    await waitFor(() => expect(get).toHaveBeenCalledWith('/admin/reports', { params: { status: 'OPEN', targetType: 'MESSAGE', limit: 50 } }))
  })
})

describe('Moderation › Word list', () => {
  const openWords = async () => {
    mount()
    await screen.findByTestId('report-counts')
    const tab = screen.getByRole('tab', { name: 'Word list' })
    fireEvent.mouseDown(tab)
    fireEvent.click(tab)
    return (await screen.findByLabelText('Word list')) as HTMLTextAreaElement
  }

  it('one word per line, blanks dropped', () => {
    expect(parseWordList(' scam \n\nidiot\n  ')).toEqual(['scam', 'idiot'])
  })

  it('shows the saved list and saves the edited one', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ data: ok({ words: ['idiot', 'scam'] }) } as never)
    const box = await openWords()
    expect(box.value).toBe('bitch\nscam')
    fireEvent.change(box, { target: { value: 'scam\n\n idiot ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save word list' }))
    await waitFor(() => expect(put).toHaveBeenCalledWith('/admin/moderation/words', { words: ['scam', 'idiot'] }))
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Word list saved' })))
  })

  it('a refused list shows the server\'s reason', async () => {
    vi.spyOn(apiClient, 'put').mockRejectedValue({ response: { status: 422, data: { message: 'Each word must be 2-50 characters: a', code: 'validation_error' } } })
    const box = await openWords()
    fireEvent.change(box, { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save word list' }))
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not save the word list', description: expect.stringContaining('2-50 characters') })),
    )
  })
})
