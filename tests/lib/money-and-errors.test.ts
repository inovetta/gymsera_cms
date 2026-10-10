import { describe, it, expect } from 'vitest'
import { toMinor, parseAmountInput, toApiAmount, formatMoney, formatMinor } from '@/lib/money'
import { describeRequestError, isReauthChallenge, serverCode } from '@/lib/api/request-errors'
import { tierAt } from '@/lib/access/tier'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { frontDeskContext, orgAdminContext, ownerContext, withPermissions } from '../fixtures/context'

describe('money (PAY-02): integer minor units, formatted only at display', () => {
  it('turns server amounts into integer minor units without float drift', () => {
    expect(toMinor(1500.5)).toBe(150050)
    expect(toMinor('1500.50')).toBe(150050)
    expect(toMinor(0.1 + 0.2)).toBe(30)
    expect(toMinor('19.999')).toBe(2000)
    expect(toMinor(-12.34)).toBe(-1234)
    expect(toMinor(null)).toBeNull()
    expect(toMinor('abc')).toBeNull()
  })

  it('parses what a person typed: two decimals at most, separators allowed', () => {
    expect(parseAmountInput('1,500.50')).toBe(150050)
    expect(parseAmountInput('3000')).toBe(300000)
    expect(parseAmountInput('10.123')).toBeNull()
    expect(parseAmountInput('-5')).toBeNull()
    expect(parseAmountInput('')).toBeNull()
  })

  it('sends the API a number with two decimals at most', () => {
    expect(toApiAmount(150050)).toBe(1500.5)
    expect(toApiAmount(1)).toBe(0.01)
  })

  it('shows paisa only when there is some', () => {
    expect(formatMoney(3000)).toMatch(/3,000$/)
    expect(formatMoney(3000.5)).toMatch(/3,000\.50$/)
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMinor(5)).toMatch(/0\.05$/)
  })
})

describe('request errors', () => {
  const reply = (status: number, data: Record<string, unknown>) => ({ response: { status, data } })

  it('prefers the server message', () => {
    expect(describeRequestError(reply(422, { message: 'Amount must be greater than 0' }), 'fallback')).toBe(
      'Amount must be greater than 0'
    )
  })

  it('joins field messages from a 422', () => {
    expect(
      describeRequestError(reply(422, { message: 'Validation failed', errors: [{ field: 'amount', message: 'amount is required' }] }), 'x')
    ).toBe('amount is required')
  })

  it('says so when the request never reached the server, never a bare "Failed to"', () => {
    expect(describeRequestError(new Error('Network Error'), 'Could not record the payment.')).toMatch(/Could not reach the server/)
  })

  it('falls back to the page copy only when the server sent nothing', () => {
    expect(describeRequestError(reply(500, {}), 'Could not load the ledger. Try again.')).toBe('Could not load the ledger. Try again.')
  })

  it('recognises the re-auth challenge by its code', () => {
    expect(isReauthChallenge(reply(401, { code: 'reauth_required' }))).toBe(true)
    expect(isReauthChallenge(reply(401, { code: 'invalid_credentials' }))).toBe(true)
    expect(isReauthChallenge(reply(401, { code: 'token_expired' }))).toBe(false)
    expect(serverCode(reply(422, { code: 'cooling_period_active' }))).toBe('cooling_period_active')
  })
})

describe('tierAt: Off / Needs approval / Direct from effective permissions', () => {
  const [desk] = frontDeskContext.organizations
  it('the owner is direct', () => {
    expect(tierAt(ownerContext.organizations[0], 'payments.refund', 'branch-1')).toBe('DIRECT')
  })
  it('a key held alone is "needs approval"; with .direct it is direct', () => {
    const request = withPermissions(frontDeskContext, ['payments.refund']).organizations[0]
    expect(tierAt(request, 'payments.refund', 'branch-1')).toBe('REQUEST')
    const direct = withPermissions(frontDeskContext, ['payments.refund', 'payments.refund.direct']).organizations[0]
    expect(tierAt(direct, 'payments.refund', 'branch-1')).toBe('DIRECT')
  })
  it('a key not held is off, and a branch the person is not at is off', () => {
    expect(tierAt(desk, 'payments.refund', 'branch-1')).toBe('OFF')
    // Held at branch-1 only: not held at another branch.
    expect(tierAt(desk, 'payments.record', 'branch-1')).toBe('REQUEST')
    expect(tierAt(desk, 'payments.record', 'branch-9')).toBe('OFF')
    // An organization-wide grant applies at any branch.
    expect(tierAt(orgAdminContext.organizations[0], 'dashboard.view', 'branch-9')).toBe('REQUEST')
    expect(tierAt(null, 'x')).toBe('OFF')
  })
})

describe('idempotency keys', () => {
  it('are unique per call', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })
})
