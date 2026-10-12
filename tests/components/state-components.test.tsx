import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ErrorState } from '@/components/features/error-state'
import { OfflineBanner } from '@/components/features/offline-banner'
import { SkeletonList } from '@/components/features/skeleton-list'
import { SkipLink } from '@/components/layout/skip-link'
import { NoAccess } from '@/components/features/no-access'
import { EmptyState } from '@/components/features/empty-state'
import { axeViolations } from '../helpers/axe'

const apiError = (status: number | undefined, data?: unknown) => ({
  response: status === undefined ? undefined : { status, data },
})

describe('ErrorState (spec §2.5)', () => {
  it('network failure: says so, offers Retry, no reference id', () => {
    const onRetry = vi.fn()
    render(<ErrorState error={apiError(undefined)} what="the member list" onRetry={onRetry} />)
    expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/reference/i)).toBeNull()
  })

  it('5xx: shows the request id to quote and a Retry button', () => {
    render(
      <ErrorState
        error={apiError(503, { error: { code: 'internal_error', message: 'Service unavailable', requestId: 'req_abc123' } })}
        what="the ledger"
        onRetry={() => {}}
      />
    )
    expect(screen.getByText('req_abc123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('4xx business error: shows the server sentence and no Retry', () => {
    render(
      <ErrorState error={apiError(409, { message: 'This branch was already deleted.' })} what="the branch" onRetry={() => {}} />
    )
    expect(screen.getByText('This branch was already deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('403: never raw, says what is missing and who to ask, no Retry', () => {
    render(<ErrorState error={apiError(403, { message: 'Forbidden' })} what="payouts" onRetry={() => {}} />)
    expect(screen.getByText(/do not have access to payouts/i)).toBeInTheDocument()
    expect(screen.queryByText('Forbidden')).toBeNull()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })
})

describe('OfflineBanner', () => {
  it('appears on the offline event and goes away on online', () => {
    render(<OfflineBanner />)
    expect(screen.queryByTestId('offline-banner')).toBeNull()
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByTestId('offline-banner')).toBeNull()
  })
})

describe('shared state components pass axe', () => {
  it('has no violations', async () => {
    const { container } = render(
      <main>
        <SkipLink />
        <SkeletonList label="members" />
        <EmptyState title="No members yet" description="Add your first member." />
        <NoAccess what="the ledger" needs="ledger.view" />
        <ErrorState error={apiError(500, { message: 'boom' })} what="members" onRetry={() => {}} />
      </main>
    )
    expect(await axeViolations(container)).toEqual([])
  })
})
