import { describe, it, expect } from 'vitest'
import { pushStateText, reasonText, scanOutcomeText } from '@/components/features/devices/device-copy'

/**
 * ZKTeco Phase 3: every code the device API returns becomes plain English (Prompt G rule 6:
 * no raw server codes on screen).
 */
const row = (over: Record<string, unknown>) => ({
  deviceId: 'd1', name: 'Front door', branchId: 'b1', branchName: 'Uptown', connection: 'online' as const, lastSeenSecondsAgo: 840,
  offline: true, state: 'queued' as const, returnCode: null, reason: null, onDevice: true, ...over,
})

describe('device copy', () => {
  it('push states, including offline at once and the 15-second timeout', () => {
    expect(pushStateText(row({ state: 'offline' }) as never, 'member')).toBe('Device offline, last seen 14 min ago. It will update when it reconnects.')
    expect(pushStateText(row({ state: 'no_answer' }) as never, 'member')).toBe('No answer in 15 seconds. The change stays queued and lands when the device answers.')
    expect(pushStateText(row({ state: 'applied' }) as never, 'remove')).toBe('Removed')
    expect(pushStateText(row({ state: 'failed', reason: 'device_storage_full', returnCode: -18 }) as never, 'member')).toBe('Failed: Device storage is full')
    expect(pushStateText(row({ state: 'failed', reason: 'device_error', returnCode: -1001 }) as never, 'member')).toBe('Failed: The device refused it (code -1001)')
    expect(pushStateText(row({ state: 'failed', reason: 'enroll_not_supported', pin: '1047' }) as never, 'enroll'))
      .toBe('This device cannot enrol remotely. Enrol on the device menu with PIN 1047.')
    expect(pushStateText(row({ state: 'not_entitled', reason: 'branch_sync_frozen' }) as never, 'member')).toMatch(/^Not pushed: Branch locked/)
  })

  it('unknown codes never show raw', () => {
    expect(reasonText('something_new')).toBe('The device refused it')
    expect(reasonText(null, -5)).toBe('The device refused it (code -5)')
  })

  it('the live feed explains scans that were let in but not counted (D-5) and refusals', () => {
    expect(scanOutcomeText({ result: 'granted', reason: null, attendanceNote: 'member_checkin_grace_expired' })).toBe('Let in, not counted: branch locked (GymsEra plan lapsed)')
    expect(scanOutcomeText({ result: 'granted', reason: null, attendanceNote: 'check_in' })).toBe('Checked in')
    expect(scanOutcomeText({ result: 'granted', reason: null, attendanceNote: 'some_refusal' })).toBe('Let in, not counted as a visit')
    expect(scanOutcomeText({ result: 'denied', reason: 'expired', attendanceNote: null })).toBe('Refused: package ended')
  })
})
