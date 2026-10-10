import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const handlers: Record<string, () => void> = {}
const socket = {
  on: vi.fn((event: string, cb: () => void) => { handlers[event] = cb }),
  off: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn((event: string, cb: () => void) => { handlers[`io:${event}`] = cb }) },
}
const io = vi.fn(() => socket)
vi.mock('socket.io-client', () => ({ io: (...args: unknown[]) => (io as any)(...args) }))

import { useAuthStore } from '@/stores/auth.store'
import { useNotificationsRealtime } from '@/hooks/use-notifications'

function Probe() {
  useNotificationsRealtime()
  return null
}

describe('realtime notifications (spec §9.2)', () => {
  beforeEach(() => {
    io.mockClear()
    socket.disconnect.mockClear()
    localStorage.setItem('gymsera_access_token', 'tok-1')
  })

  it('does not connect before sign-in', () => {
    useAuthStore.setState({ isAuthenticated: false })
    render(<QueryClientProvider client={new QueryClient()}><Probe /></QueryClientProvider>)
    expect(io).not.toHaveBeenCalled()
  })

  it('connects with the token in the auth payload (never the URL) and refreshes the server counts on an event', async () => {
    useAuthStore.setState({ isAuthenticated: true })
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { unmount } = render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)

    await waitFor(() => expect(io).toHaveBeenCalledTimes(1))
    const [url, options] = io.mock.calls[0] as unknown as [string, { auth: (cb: (a: { token: string }) => void) => void }]
    expect(url).not.toContain('token')
    const seen: { token: string }[] = []
    options.auth((a) => seen.push(a))
    expect(seen[0]).toEqual({ token: 'tok-1' })

    handlers['new_notification']()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] })

    unmount()
    expect(socket.disconnect).toHaveBeenCalled()
  })

  it('picks up a refreshed token on the next connect', async () => {
    useAuthStore.setState({ isAuthenticated: true })
    render(<QueryClientProvider client={new QueryClient()}><Probe /></QueryClientProvider>)
    await waitFor(() => expect(io).toHaveBeenCalled())
    const [, options] = io.mock.calls[0] as unknown as [string, { auth: (cb: (a: { token: string }) => void) => void }]
    localStorage.setItem('gymsera_access_token', 'tok-2')
    const seen: { token: string }[] = []
    options.auth((a) => seen.push(a))
    expect(seen[0]).toEqual({ token: 'tok-2' })
  })
})
