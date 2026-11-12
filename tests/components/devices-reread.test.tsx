import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DeviceImportPage from '@/app/(dashboard)/gym/devices/[id]/import/page'
import DeviceDetailPage from '@/app/(dashboard)/gym/devices/[id]/page'
import { devicesApi, AccessDevice, AttStamps, DeviceImport } from '@/lib/api/devices'
import { meApi, MyContext } from '@/lib/api/me'
import { tenantsApi } from '@/lib/api/tenants'
import { ok } from '../fixtures/team'
import { frontDeskContext, ownerContext } from '../fixtures/context'

/**
 * NEW-242 (gymsera_be docs/ZKTECO_PUSH_DEVICE_SYNC.md §15 "NEW-242"): a T&A PUSH device in import hold that kept
 * an old upload stamp (9999 from a capture-server test) sends only part of its users. "Read all users again" on
 * the import page asks the server to make it send everything again; the device page and the import page show
 * where that stands (waiting, queried, reading, done) and the stamps. Values come from the API only.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useParams: () => ({ id: 'd1' }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('@/components/layout/header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', fullName: 'Test Person', role: 'GYM_HOST' }, logout: vi.fn(), isPlatformAdmin: false, isGymHost: true, isBranchManager: false }),
}))

const stamps = (over: Partial<AttStamps> = {}): AttStamps => ({
  ATTLOG: '9999', OPERLOG: '9999', BIODATA: '9999', forced: [], reread: null, ...over,
})
const device = (over: Partial<AccessDevice> = {}): AccessDevice => ({
  id: 'd1', deviceKey: 'K7QM3XRT', key: 'K7QM-3XRT', branchId: 'branch-1', branchName: 'Uptown', organizationId: 'org-1', name: 'GBS Door',
  direction: 'in', enabled: true, linkMode: 'host', status: 'active', connection: 'online', serialNumber: 'SIM1', registeredAt: '2026-11-12T09:00:00Z',
  lastSeenAt: '2026-11-12T10:00:00Z', lastSeenSecondsAgo: 3, lastIp: '203.0.113.7', scheme: 'https', encrypted: true, tokenState: 'absent', serialMismatch: null,
  model: 'SpeedFace-V5L', firmware: 'ZAM180-NF50VA-Ver3.4.9', pushVersion: 'Ver 2.0.33S-20220623', deviceType: 'att',
  capabilities: { fingerprint: true, face: true, palm: true },
  counts: { users: 358, faces: 19, fingerprints: 433, palms: 0, attendanceRecords: 14262, maxUsers: 10000 },
  attOptions: { userAuthorize: false, validityMode: 'none', userCommandForm: 'user' },
  poll: { delaySeconds: 3, ownDelay: null, gapSeconds: 3, lastPollAt: '2026-11-12T10:00:00Z' },
  attStamps: stamps(),
  importHold: true, importHoldSince: '2026-11-12T09:00:00Z', liveAt: null, createdAt: '2026-11-12T08:00:00Z', ...over,
})
const setup = { mode: 'host' as const, serverAddress: 'k7qm3xrt.push.gymsera.com', port: 443, https: true, domainName: true, key: 'K7QM-3XRT' }
const imp = (over: Partial<DeviceImport> = {}): DeviceImport => ({
  id: 'IMP1', deviceId: 'd1', status: 'ready', startedAt: '2026-11-12T09:00:00Z', readyAt: '2026-11-12T09:03:00Z', appliedAt: null, liveAt: null, finishedAt: null,
  truncated: false, types: [1, 9], failedQueries: [], failedReason: null, result: null, reread: null,
  counts: { users: 32, templates: 241, templatesTooLarge: 0, admins: 24, matched: 0, unmatched: 8, conflicts: 0, removeAtGoLive: 0 },
  ...over,
})
const preview = {
  willStore: { identities: 0, templates: 0, templatesPending: 0, alreadyEnrolled: 0, cards: 0 }, consentNeeded: [],
  skipped: { unmatched: 8, admins: 24, alreadyEnrolled: 0, templatesNotImported: 241 }, atGoLive: { removePins: [], notEntitled: 0, sendUnderOwnPin: [] },
  blocking: [], capacity: { users: 32, maxUsers: 10000, percent: 0 },
}

const renderWith = (ui: React.ReactElement, context: MyContext = ownerContext) => {
  vi.spyOn(meApi, 'getContext').mockResolvedValue(ok(context) as never)
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
}
const importPage = (opts: { dev?: AccessDevice; imports?: DeviceImport[]; context?: MyContext } = {}) => {
  vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({ device: opts.dev ?? device(), setup }) as never)
  vi.spyOn(devicesApi, 'imports').mockResolvedValue(ok({ imports: opts.imports ?? [imp()] }) as never)
  vi.spyOn(devicesApi, 'importUsers').mockResolvedValue(ok({ users: [], total: 0, limit: 50, offset: 0 }) as never)
  vi.spyOn(devicesApi, 'importPreview').mockResolvedValue(ok({ preview }) as never)
  return renderWith(<DeviceImportPage />, opts.context)
}

beforeEach(() => {
  vi.spyOn(tenantsApi, 'getMyTenant').mockResolvedValue(ok({ tenant: { status: 'ACTIVE' }, subscription: null }) as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Import page: Read all users again', () => {
  it('T&A device in hold, import ready: asks first (nothing on the device changes), then calls the server', async () => {
    const reread = vi.spyOn(devicesApi, 'rereadImport').mockResolvedValue(ok({ import: imp({ status: 'querying', reread: { state: 'waiting', requestedAt: '2026-11-12T10:00:00Z', servedAt: null, startedAt: null, doneAt: null, count: 1 } }) }) as never)
    importPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Read all users again' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/Nothing on the device changes/)
    expect(dialog).toHaveTextContent(/punches are not sent again/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read again' }))
    await waitFor(() => expect(reread).toHaveBeenCalledWith('d1', 'IMP1'))
  })

  it('while reading (querying), the button stays and the state is shown in words', async () => {
    importPage({ imports: [imp({ status: 'querying', reread: { state: 'reading', requestedAt: '2026-11-12T10:00:00Z', servedAt: '2026-11-12T10:00:05Z', startedAt: '2026-11-12T10:00:09Z', doneAt: null, count: 1 } })] })
    expect(await screen.findByTestId('import-reread')).toHaveTextContent('Reading users')
    expect(screen.getByRole('button', { name: 'Read all users again' })).toBeInTheDocument()
  })

  it('no button for an Access Control PUSH device, an applied import, or front desk (devices.view)', async () => {
    const { unmount } = importPage({ dev: device({ deviceType: 'acc', attStamps: null }) })
    await screen.findByTestId('import-summary')
    expect(screen.queryByRole('button', { name: 'Read all users again' })).toBeNull()
    unmount()

    const second = importPage({ imports: [imp({ status: 'applied', appliedAt: '2026-11-12T10:00:00Z' })] })
    await screen.findByRole('link', { name: 'Continue to the cut-over' })
    expect(screen.queryByRole('button', { name: 'Read all users again' })).toBeNull()
    second.unmount()

    importPage({ context: frontDeskContext })
    await screen.findByTestId('import-summary')
    expect(screen.queryByRole('button', { name: 'Read all users again' })).toBeNull()
  })
})

describe('Device page: upload stamps and the re-read state', () => {
  const renderDevice = (dev: AccessDevice) => {
    vi.spyOn(devicesApi, 'get').mockResolvedValue(ok({ device: dev, setup }) as never)
    return renderWith(<DeviceDetailPage />)
  }

  it.each([
    ['waiting', 'Waiting for the device'],
    ['queried', 'Device asked to send everything'],
    ['reading', 'Reading users'],
    ['done', 'Done'],
  ] as const)('%s: "%s"', async (state, text) => {
    const forced = state === 'waiting' || state === 'queried' ? ['OPERLOG', 'BIODATA'] : []
    renderDevice(device({ attStamps: stamps({ forced, reread: { importId: 'IMP1', state, requestedAt: '2026-11-12T10:00:00Z', servedAt: null, startedAt: null, doneAt: null } }) }))
    const card = await screen.findByTestId('device-facts')
    expect(within(card).getByText('Read all users again').nextSibling).toHaveTextContent(text)
  })

  it('stamps: what the device reported, and "0 sent" for a forced table', async () => {
    renderDevice(device({ attStamps: stamps({ forced: ['OPERLOG', 'BIODATA'], reread: { importId: 'IMP1', state: 'queried', requestedAt: null, servedAt: null, startedAt: null, doneAt: null } }) }))
    const card = await screen.findByTestId('device-facts')
    const value = within(card).getByText('Upload stamps').nextSibling
    expect(value).toHaveTextContent('Users and templates 9999 (0 sent)')
    expect(value).toHaveTextContent('Faces 9999 (0 sent)')
    expect(value).toHaveTextContent('Punches 9999')
    expect(value).not.toHaveTextContent('Punches 9999 (0 sent)')
  })

  it('no re-read yet: stamps only; an Access Control PUSH device shows neither', async () => {
    const { unmount } = renderDevice(device())
    const card = await screen.findByTestId('device-facts')
    expect(within(card).getByText('Upload stamps')).toBeInTheDocument()
    expect(within(card).queryByText('Read all users again')).toBeNull()
    unmount()
    renderDevice(device({ deviceType: 'acc', attOptions: null, attStamps: null }))
    const acc = await screen.findByTestId('device-facts')
    expect(within(acc).queryByText('Upload stamps')).toBeNull()
  })
})
