import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LapsedPlanCard } from '@/components/features/lapsed-plan-card'

/**
 * Phase 7 P11c, NEW-233. The lapsed-plan card said "Fix payment in App Store" (no "the") and did not
 * say which channel the plan was bought through. It now names the channel (App Store, Google Play or
 * bank transfer) on its own line, and the store link reads "Fix payment in the App Store".
 */
const lapse = (provider: string, reason = 'on_hold', manageUrl: string | null = null) => ({
  status: reason === 'on_hold' ? 'ON_HOLD' : 'EXPIRED',
  reason,
  provider,
  manageUrl,
  endedAt: '2026-10-28T12:00:00Z',
  branchesLockAt: '2026-11-04T12:00:00Z',
  inGrace: true,
  remainingDays: 4,
})
const mount = (l: ReturnType<typeof lapse>) =>
  render(<LapsedPlanCard lapse={l as never} endDate="2026-10-28T12:00:00Z" platform={l.provider} />)

describe('NEW-233: the lapsed-plan card names the channel the plan was bought through', () => {
  it('App Store: "Bought through the App Store." and "Fix payment in the App Store"', () => {
    mount(lapse('IOS', 'on_hold', 'https://apps.apple.com/account/subscriptions'))
    expect(screen.getByTestId('lapsed-plan-channel')).toHaveTextContent(/^Bought through the App Store\.$/)
    expect(screen.getByRole('link', { name: 'Fix payment in the App Store' })).toHaveAttribute('href', 'https://apps.apple.com/account/subscriptions')
    expect(document.body.textContent).not.toMatch(/in App Store/)
  })

  it('Google Play: "Bought through Google Play." and "Fix payment in Google Play"', () => {
    mount(lapse('ANDROID', 'on_hold', 'https://play.google.com/store/account/subscriptions'))
    expect(screen.getByTestId('lapsed-plan-channel')).toHaveTextContent(/^Bought through Google Play\.$/)
    expect(screen.getByRole('link', { name: 'Fix payment in Google Play' })).toHaveAttribute('href', 'https://play.google.com/store/account/subscriptions')
  })

  it('bank transfer: "Paid by bank transfer." and how to pay again, no store link', () => {
    mount(lapse('MANUAL', 'expired'))
    expect(screen.getByTestId('lapsed-plan-channel')).toHaveTextContent(/^Paid by bank transfer\.$/)
    expect(screen.getByText(/pay by bank transfer below/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body.textContent).not.toMatch(/App Store|Google Play/)
  })

  it('App Store plan that simply ended: still names the App Store', () => {
    mount(lapse('IOS', 'expired'))
    expect(screen.getByTestId('lapsed-plan-channel')).toHaveTextContent(/^Bought through the App Store\.$/)
  })

  it('unknown channel: no channel line (nothing guessed)', () => {
    mount(lapse('', 'expired'))
    expect(screen.queryByTestId('lapsed-plan-channel')).toBeNull()
  })
})
