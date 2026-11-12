import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LiveFeed } from '@/components/features/devices/device-tabs'
import { AccessEvent, devicesApi } from '@/lib/api/devices'
import { ok } from '../fixtures/team'

/**
 * Live feed time (2026-11-12, SpeedFace-V5L on a Pakistan branch): the feed showed a PKT punch at 17:22:50 as
 * "2026-11-12T17:22:50.000Z" because the API returned the device wall time as a Date. The API now sends
 * `localTime` as plain 'YYYY-MM-DD HH:mm:ss' (the device's clock = the branch's) and `time` as the UTC instant.
 * The Time column shows `localTime` as sent: no 'T', no 'Z', never shifted to the browser's zone.
 */
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))

const event = (over: Partial<AccessEvent> = {}): AccessEvent => ({
  id: 7, deviceId: 'd1', deviceName: 'SpeedFace-V5L', branchId: 'branch-1',
  time: '2026-11-12T12:22:50.000Z', localTime: '2026-11-12 17:22:50',
  pin: '9001', memberId: 'm1', memberName: 'Test Member', result: 'granted', reason: null,
  attendanceNote: 'check_in', checkedIn: true, photoId: null, ...over,
})

const renderFeed = (props: { deviceId?: string; branchId?: string }) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LiveFeed {...props} /></QueryClientProvider>)

afterEach(() => vi.restoreAllMocks())

describe('Live feed time', () => {
  it('shows the device wall time exactly as the API sends it, without a Z', async () => {
    vi.spyOn(devicesApi, 'accessEvents').mockResolvedValue(ok({ events: [event()], latestId: 7 }) as never)
    renderFeed({ deviceId: 'd1' })
    const table = await screen.findByTestId('live-feed')
    const row = within(table).getAllByRole('row')[1]
    const timeCell = within(row).getAllByRole('cell')[0]
    expect(timeCell).toHaveTextContent(/^2026-11-12 17:22:50$/)
    expect(timeCell.textContent).not.toMatch(/Z|T\d/)
    expect(table.textContent).not.toContain('12:22:50')
  })

  it('the branch feed shows the same wall time', async () => {
    vi.spyOn(devicesApi, 'branchAccessEvents').mockResolvedValue(ok({ events: [event()], latestId: 7 }) as never)
    renderFeed({ branchId: 'branch-1' })
    const table = await screen.findByTestId('live-feed')
    const row = within(table).getAllByRole('row')[1]
    expect(within(row).getAllByRole('cell')[0]).toHaveTextContent(/^2026-11-12 17:22:50$/)
    expect(within(row).getByText('SpeedFace-V5L')).toBeInTheDocument()
  })
})
