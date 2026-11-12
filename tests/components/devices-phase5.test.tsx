import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DeviceDetailPage from '@/app/(dashboard)/gym/devices/[id]/page'
import { devicesApi, AccessDevice } from '@/lib/api/devices'
import { deviceTypeText, scanOutcomeText } from '@/components/features/devices/device-copy'
import { meApi } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { ownerContext } from '../fixtures/context'

/**
 * ZKTeco Phase 5 (gymsera_be docs/ZKTECO_PUSH_DEVICE_SYNC.md §15 Phase 5): a T&A PUSH (attendance protocol)
 * device on the device page: its type, push version, the counts it reports (palms, attendance records), what
 * GymsEra sends it (userauthorize, validity, command form) and a note saying what that means. Scans from the
 * device's history are explained in the live feed. Values come from the API only.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useParams: () => ({ id: 'd1' }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Test Person', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

const device = (over: Partial<AccessDevice> = {}): AccessDevice => ({
  id: 'd1', deviceKey: 'K7QM3XRT', key: 'K7QM-3XRT', branchId: 'branch-1', branchName: 'Uptown', organizationId: 'org-1', name: 'Front Door',
  direction: 'in', enabled: true, linkMode: 'host', status: 'active', connection: 'online', serialNumber: 'SIM1', registeredAt: '2026-11-10T09:00:00Z',
  lastSeenAt: '2026-11-10T10:00:00Z', lastSeenSecondsAgo: 3, lastIp: '203.0.113.7', scheme: 'https', encrypted: true, tokenState: 'absent', serialMismatch: null,
  model: 'SpeedFace-V5L', firmware: 'ZAM180-NF50VA-Ver3.4.9', pushVersion: 'Ver 2.0.33S-20220623', deviceType: 'att',
  capabilities: { fingerprint: true, face: true, palm: true },
  counts: { users: 356, faces: 15, fingerprints: 416, palms: 0, attendanceRecords: 14262, maxUsers: 10000 },
  attOptions: { userAuthorize: false, validityMode: 'none', userCommandForm: 'user' },
  poll: { delaySeconds: 3, ownDelay: null, gapSeconds: 3, lastPollAt: '2026-11-10T10:00:00Z' },
  importHold: false, importHoldSince: null, liveAt: null, createdAt: '2026-11-10T08:00:00Z', ...over,
})
const setup = { mode: 'host' as const, serverAddress: 'k7qm3xrt.push.gymsera.com', port: 443, https: true, domainName: true, key: 'K7QM-3XRT' }

const renderPage = () => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(ownerContext) as never)
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DeviceDetailPage /></QueryClientProvider>)
}

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('T&A PUSH device page', () => {
  it('type, push version and the counts the device reports', async () => {
    vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({ device: device(), setup }) as never)
    renderPage()
    const card = await screen.findByTestId('device-facts')
    expect(within(card).getByText('Device type').nextSibling).toHaveTextContent('T&A PUSH (attendance)')
    expect(within(card).getByText('Push version').nextSibling).toHaveTextContent('Ver 2.0.33S-20220623')
    expect(within(card).getByText('Users on device').nextSibling).toHaveTextContent('356 of 10000')
    expect(within(card).getByText('Fingerprints').nextSibling).toHaveTextContent('416')
    expect(within(card).getByText('Palms').nextSibling).toHaveTextContent('0')
    expect(within(card).getByText('Attendance records').nextSibling).toHaveTextContent('14262')
    expect(within(card).getByText('Polls every').nextSibling).toHaveTextContent('3 s')
  })

  it('a note says what GymsEra sends a T&A PUSH device', async () => {
    vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({ device: device(), setup }) as never)
    renderPage()
    const note = await screen.findByTestId('att-note')
    expect(note).toHaveTextContent('This is a T&A PUSH (attendance) device')
    expect(note).toHaveTextContent('No door permission (userauthorize) is sent')
    expect(note).toHaveTextContent('No end date is put on the device: GymsEra removes members whose package ended within 15 minutes')
    expect(note).toHaveTextContent('Members are sent as device users (DATA UPDATE user)')
    expect(note).toHaveTextContent('Punches from before the device joined GymsEra are kept as history, not counted as visits')
  })

  it('the note follows the device options', async () => {
    vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({ device: device({ attOptions: { userAuthorize: true, validityMode: 'datetime', userCommandForm: 'userinfo' } }), setup }) as never)
    renderPage()
    const note = await screen.findByTestId('att-note')
    expect(note).toHaveTextContent('A door permission (userauthorize) is sent with each member')
    expect(note).toHaveTextContent('The package end date is put on the device')
    expect(note).toHaveTextContent('Members are sent in the attendance form (DATA UPDATE USERINFO)')
  })

  it('an access control device: no note, no attendance-only rows', async () => {
    vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({
      device: device({ deviceType: 'acc', pushVersion: '3.1.2', attOptions: null, counts: { users: 7, faces: 6, fingerprints: 1, maxUsers: 10000, palms: null, attendanceRecords: null } }),
      setup,
    }) as never)
    renderPage()
    const card = await screen.findByTestId('device-facts')
    expect(within(card).getByText('Device type').nextSibling).toHaveTextContent('Access control PUSH')
    expect(within(card).queryByText('Attendance records')).toBeNull()
    expect(within(card).queryByText('Palms')).toBeNull()
    expect(screen.queryByTestId('att-note')).toBeNull()
  })
})

describe('copy', () => {
  it('device type in words; unknown types never raw', () => {
    expect(deviceTypeText('att')).toBe('T&A PUSH (attendance)')
    expect(deviceTypeText('acc')).toBe('Access control PUSH')
    expect(deviceTypeText(null)).toBeNull()
    expect(deviceTypeText('xyz')).toBe('Other')
  })

  it('history scans in the live feed', () => {
    expect(scanOutcomeText({ result: 'granted', reason: null, attendanceNote: 'history' })).toBe('From the device history, before it joined GymsEra: not counted')
  })
})
